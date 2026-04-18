import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Ref,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Media } from './data/projects'
import { defaultProjectCategory, defaultProjectDescription, projects } from './data/projects'
import { ProjectInfoBody } from './ProjectInfoBody'
import { SquircleMediaStroke } from './SquircleMediaStroke'
import gsap from 'gsap'
import { Squircle } from '@squircle-js/react'
import { ArchiveOverlay } from './components/ArchiveOverlay'
import { ArchiveTeaser } from './components/ArchiveTeaser'
import { ARCHIVE_SHELL_EXIT_MS } from './lib/archiveShellTiming'
import { easeViewInset } from './lib/easeViewInset'
import { runWithViewTransition } from './lib/viewTransition'
import { computeAboutMarkFlipInvert } from './lib/aboutMarkFlip'
import type { StageChromeTone } from './lib/stageChromeSampling'
import { sampleStageChromeTone } from './lib/stageChromeSampling'
import './App.css'

const USE_COLOR_MEDIA_PLACEHOLDERS = false

/** Matches `--project-media-radius` in index.css */
const PROJECT_MEDIA_RADIUS = 20
/** Matches `.cardLabelDot` / `.railDotAnchor` in App.css */
const RAIL_DOT_SIZE_PX = 10
const RAIL_DOT_JUMP_MS = 240

/**
 * Dot is `position:absolute` on `.railTrack` (inside the horizontal scroll content), so it moves
 * with the strip when `.rail` scrolls — no scroll listeners. Origin = track padding edge.
 */
function computeRailDotTranslate(track: HTMLDivElement, anchor: HTMLElement) {
  const trackRect = track.getBoundingClientRect()
  const ox = trackRect.left + track.clientLeft
  const oy = trackRect.top + track.clientTop
  const anchorRect = anchor.getBoundingClientRect()
  const cx = anchorRect.left + anchorRect.width / 2 - ox
  const cy = anchorRect.top + anchorRect.height / 2 - oy
  return { x: cx - RAIL_DOT_SIZE_PX / 2, y: cy - RAIL_DOT_SIZE_PX / 2 }
}

function getRailDotTranslateFromVisual(track: HTMLDivElement, dot: HTMLElement) {
  const trackRect = track.getBoundingClientRect()
  const ox = trackRect.left + track.clientLeft
  const oy = trackRect.top + track.clientTop
  const dotRect = dot.getBoundingClientRect()
  return {
    x: dotRect.left - ox,
    y: dotRect.top - oy,
  }
}

function buildRailDotJumpKeyframes(
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps: number,
) {
  const cx = (start.x + end.x) / 2
  const dx = Math.abs(end.x - start.x)
  /* Nearly straight path — tiny lift so motion reads as glide, not a bounce */
  const arcH = Math.min(36, dx * 0.08 + 8)
  const cy = Math.min(start.y, end.y) - arcH
  const keyframes: { transform: string }[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cx + t * t * end.x
    const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cy + t * t * end.y
    keyframes.push({ transform: `translate(${x}px, ${y}px)` })
  }
  return keyframes
}
/** Matches `--duration-stage-info` — stage squircle + info layout only */
const VIEW_RESIZE_MS = 240
/** Matches `animation-delay: stagger * (--duration-stage-info / 10)` on `.card[data-rail-enter='on']` */
const RAIL_STAGGER_TIME_DIVISOR = 10
/** Matches `--duration-rail-card-enter` in index.css */
const RAIL_CARD_ENTER_MS = 280

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/** Prefer `\n\n` in copy; otherwise split after first “. ”; never force a mid-paragraph break */
function splitProjectDescription(raw: string): [string, string] {
  const t = raw.trim()
  const blocks = t
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (blocks.length >= 2) {
    return [blocks[0], blocks.slice(1).join('\n\n')]
  }
  const dot = t.indexOf('. ')
  if (dot !== -1 && dot < t.length - 2) {
    return [t.slice(0, dot + 1).trim(), t.slice(dot + 2).trim()]
  }
  return [t, '']
}

function mediaPlaceholderColor(media: Media) {
  const key =
    media.kind === 'video' ? `video:${media.src}:${media.poster ?? ''}` : `image:${media.src}:${media.alt}`
  const hash = hashString(key)
  const hue = hash % 360
  const saturation = 58 + (hash % 18)
  const lightness = 46 + ((hash >> 3) % 18)
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

/**
 * Some of the WebMs in the gallery are exported without a duration field in the EBML
 * header, so `<video>.duration` reports `Infinity` until the entire file is scanned.
 * That breaks the story-meter progress bar (and any seek-aware UI).
 *
 * The fix: fetch the file once, hand the browser a `blob:` URL pointing at the
 * fully-buffered bytes, and `duration` becomes available immediately. We cache the
 * resolved URLs in-memory keyed by source so a second visit is free.
 */
const videoBlobCache = new Map<string, string>()
const videoBlobInflight = new Map<string, Promise<string>>()

function loadVideoAsBlobUrl(src: string): Promise<string> {
  const cached = videoBlobCache.get(src)
  if (cached) return Promise.resolve(cached)
  const inflight = videoBlobInflight.get(src)
  if (inflight) return inflight
  const p = fetch(src, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error(`Video fetch failed: ${res.status} ${src}`)
      return res.blob()
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      videoBlobCache.set(src, url)
      videoBlobInflight.delete(src)
      return url
    })
    .catch((err) => {
      videoBlobInflight.delete(src)
      throw err
    })
  videoBlobInflight.set(src, p)
  return p
}

/** Returns a stable blob URL for the given video src; falls back to the direct src on error. */
function useResolvedVideoSrc(src: string, enabled: boolean): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() =>
    enabled ? videoBlobCache.get(src) : undefined,
  )
  useEffect(() => {
    if (!enabled) {
      setResolved(undefined)
      return
    }
    const cached = videoBlobCache.get(src)
    if (cached) {
      setResolved(cached)
      return
    }
    let cancelled = false
    setResolved(undefined)
    loadVideoAsBlobUrl(src)
      .then((url) => {
        if (!cancelled) setResolved(url)
      })
      .catch(() => {
        // Network/permissions failure — fall back to the direct src (worse duration story but at least plays).
        if (!cancelled) setResolved(src)
      })
    return () => {
      cancelled = true
    }
  }, [src, enabled])
  return resolved
}

const MediaView = forwardRef<
  HTMLImageElement | HTMLVideoElement,
  {
    media: Media
    className?: string
    fit: 'cover' | 'contain'
    /** Slider cards: show poster still for video instead of playing */
    variant?: 'full' | 'thumb'
    /** Loop video playback. Disable on the main stage so `ended` fires and the slide can advance. */
    loop?: boolean
    onMediaDecoded?: () => void
  }
>(function MediaView({ media, className, fit, variant = 'full', loop = true, onMediaDecoded }, ref) {
  // Hooks must run unconditionally; only consume the result for full-variant videos.
  const isFullVideo = media.kind === 'video' && variant === 'full'
  const blobSrc = useResolvedVideoSrc(media.kind === 'video' ? media.src : '', isFullVideo)

  if (USE_COLOR_MEDIA_PLACEHOLDERS) {
    return <div className={className} style={{ background: mediaPlaceholderColor(media) }} aria-hidden />
  }

  if (media.kind === 'video') {
    if (variant === 'thumb' && media.poster) {
      return (
        <img
          ref={ref as Ref<HTMLImageElement>}
          className={className}
          src={media.poster}
          alt=""
          draggable={false}
          style={{ objectFit: fit }}
          onLoad={onMediaDecoded}
        />
      )
    }
    // Full video: prefer the blob URL (always knows duration). While it loads, render the
    // <video> element with `src` omitted so the poster image stands in — no broken-duration flash.
    return (
      <video
        ref={ref as Ref<HTMLVideoElement>}
        className={className}
        src={blobSrc}
        poster={media.poster}
        muted
        playsInline
        loop={loop}
        autoPlay={variant === 'full'}
        preload={variant === 'thumb' ? 'metadata' : 'auto'}
        controls={false}
        style={{ objectFit: fit }}
        onLoadedData={onMediaDecoded}
      />
    )
  }
  return (
    <img
      ref={ref as Ref<HTMLImageElement>}
      className={className}
      src={media.src}
      alt={media.alt}
      draggable={false}
      style={{ objectFit: fit }}
      onLoad={onMediaDecoded}
    />
  )
})

/* ─────────────────────────────────────────────────────────
 * GALLERY STAGE STORYBOARD
 *
 *    0ms   asset prop changes → kick off Image.decode() of the next src
 *    *ms   decode resolves → atomic swap to new src (already in cache)
 *          previous frame is mounted as an "outgoing" layer on top
 *    0ms   outgoing layer begins fading 1 → 0 (GALLERY_FADE_MS)
 *  140ms   outgoing layer reaches 0 and is unmounted
 *
 * Project change (gallery prop changes upstream):
 *   the entire gallery is preloaded in parallel so subsequent step-throughs
 *   resolve their decode immediately — the previous frame stays visible the
 *   whole time, so no background shows through the squircle.
 *
 * Videos: bypass the decode wait and swap immediately; the previous image
 * still crossfades out beneath the loading video (no flash to background).
 * ───────────────────────────────────────────────────────── */
const GALLERY_FADE_MS = 140

function mediaIdentity(media: Media): string {
  return media.kind === 'video' ? `v:${media.src}` : `i:${media.src}`
}

const GalleryStageLayer = forwardRef<
  HTMLImageElement | HTMLVideoElement,
  {
    media: Media
    fit: 'cover' | 'contain'
    className: string
    loop?: boolean
    onLoaded?: () => void
  }
>(function GalleryStageLayer({ media, fit, className, loop = true, onLoaded }, ref) {
  if (USE_COLOR_MEDIA_PLACEHOLDERS) {
    return (
      <div
        className={className}
        style={{ background: mediaPlaceholderColor(media) }}
        aria-hidden
      />
    )
  }

  if (media.kind === 'video') {
    return (
      <video
        ref={ref as Ref<HTMLVideoElement>}
        className={className}
        src={media.src}
        poster={media.poster}
        muted
        playsInline
        loop={loop}
        autoPlay
        preload="auto"
        controls={false}
        style={{ objectFit: fit }}
        onLoadedData={onLoaded}
      />
    )
  }

  return (
    <img
      ref={ref as Ref<HTMLImageElement>}
      className={className}
      src={media.src}
      alt={media.alt}
      draggable={false}
      decoding="async"
      style={{ objectFit: fit }}
      onLoad={onLoaded}
    />
  )
})

const GalleryStage = forwardRef<
  HTMLImageElement | HTMLVideoElement,
  {
    media: Media
    fit: 'cover' | 'contain'
    loop?: boolean
    onMediaDecoded?: () => void
  }
>(function GalleryStage({ media, fit, loop = true, onMediaDecoded }, ref) {
  const [displayed, setDisplayed] = useState<Media>(media)
  const [outgoing, setOutgoing] = useState<Media | null>(null)
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (mediaIdentity(media) === mediaIdentity(displayed)) return
    const reqId = ++reqIdRef.current

    const swap = () => {
      if (reqId !== reqIdRef.current) return
      setOutgoing(displayed)
      setDisplayed(media)
    }

    if (media.kind !== 'image') {
      swap()
      return
    }

    const probe = new Image()
    probe.src = media.src
    let cancelled = false
    const finish = () => {
      if (cancelled) return
      swap()
    }
    if (typeof probe.decode === 'function') {
      probe.decode().then(finish, finish)
    } else if (probe.complete) {
      finish()
    } else {
      probe.onload = finish
      probe.onerror = finish
    }

    return () => {
      cancelled = true
    }
  }, [media, displayed])

  useEffect(() => {
    if (!outgoing) return
    const id = window.setTimeout(() => setOutgoing(null), GALLERY_FADE_MS + 60)
    return () => window.clearTimeout(id)
  }, [outgoing])

  return (
    <div className="galleryStage">
      <GalleryStageLayer
        key={`in-${mediaIdentity(displayed)}`}
        ref={ref}
        media={displayed}
        fit={fit}
        loop={loop}
        className="galleryStageLayer galleryStageLayer--in"
        onLoaded={onMediaDecoded}
      />
      {outgoing && mediaIdentity(outgoing) !== mediaIdentity(displayed) && (
        <GalleryStageLayer
          key={`out-${mediaIdentity(outgoing)}`}
          media={outgoing}
          fit={fit}
          loop={loop}
          className="galleryStageLayer galleryStageLayer--out"
        />
      )}
    </div>
  )
})

const SWIPE_STEP = 42
/** prefers-reduced-motion: coarser wheel threshold before info open/close */
const INFO_WHEEL_STEP = 56
/** Wheel accumulation (px) to commit info open/close (horizontal or vertical intent) */
const INFO_COMMIT_WHEEL_ACC = 140
/** Touch vertical swipe (px) to commit — swipe down opens, swipe up closes */
const INFO_SWIPE_COMMIT_PY = 88

/** Let native wheel scroll long copy in the info panel instead of closing. */
function wheelShouldDeferToInfoPanelScroll(
  target: Node | null,
  py: number,
  panel: HTMLElement | null,
  infoOpen: boolean,
): boolean {
  if (!infoOpen || !target || !panel || !panel.contains(target)) return false
  if (panel.scrollHeight <= panel.clientHeight + 1) return false
  const atTop = panel.scrollTop <= 0
  const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1
  if (py < 0 && !atTop) return true
  if (py > 0 && !atBottom) return true
  return false
}

function touchVerticalShouldDeferToInfoPanelScroll(
  target: Node | null,
  deltaY: number,
  absX: number,
  absY: number,
  panel: HTMLElement | null,
  infoOpen: boolean,
): boolean {
  if (!infoOpen || !target || !panel || !panel.contains(target)) return false
  if (panel.scrollHeight <= panel.clientHeight + 1) return false
  if (absY <= absX || absY <= 12) return false
  const atTop = panel.scrollTop <= 0
  const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1
  if (deltaY < 0 && !atTop) return true
  if (deltaY > 0 && !atBottom) return true
  return false
}

/** Avoid treating panel scroll as swipe-to-close on finger lift (close = swipe up / deltaY < 0). */
function touchEndVerticalIsPanelScrollNotClose(
  deltaY: number,
  absX: number,
  absY: number,
  target: Node | null,
  panel: HTMLElement | null,
  infoOpen: boolean,
): boolean {
  if (!infoOpen || !target || !panel || !panel.contains(target)) return false
  if (panel.scrollHeight <= panel.clientHeight + 1) return false
  if (absY <= absX || absY < 12) return false
  const atTop = panel.scrollTop <= 0
  return deltaY < 0 && !atTop
}
const RAIL_WHEEL_X_MIN = 1.5
const RAIL_HORIZONTAL_RATIO = 0.65
const VERTICAL_INTENT_RATIO = 1.12
const DRAG_CLICK_SUPPRESS_MS = 220
const DRAG_START_PX = 8
/** px/ms; release below this uses no inertial scroll */
const RAIL_MOMENTUM_MIN_VELOCITY = 0.028
/** No velocity boost — avoids coasting that reads as a second “bounce” */
const RAIL_MOMENTUM_BOOST = 1
/** Per ~16ms frame; used with delta-time for frame-rate independence */
const RAIL_MOMENTUM_FRICTION = 0.91
/** EMA blend for pointer velocity samples */
const RAIL_VELOCITY_SMOOTH = 0.55
const RAIL_MOMENTUM_STOP = 0.012
/** Extra space between cards at max intensity (px); smaller = less scroll/layout feedback */
const RAIL_GAP_MAX_EXTRA_PX = 3
/** |scroll speed| (px/ms) that reaches ~full extra gap */
const RAIL_GAP_SPEED_REF = 1.05
/** Wheel delta magnitude (px) treated as a strong horizontal intent */
const RAIL_GAP_WHEEL_REF = 92
/** Blend toward measured speed each scroll sample */
const RAIL_GAP_SMOOTH = 0.42
/** Decay while intensity is moderate–high (after input stops) */
const RAIL_GAP_DECAY = 0.8
/** Faster decay for the last bit so the strip does not “creep” closed */
const RAIL_GAP_DECAY_TAIL = 0.66
/** Below this normalized intensity, snap gap closed (avoids long tail + jitter) */
const RAIL_GAP_SNAP = 0.058
/** Wait this long after last feed before decaying */
const RAIL_GAP_IDLE_MS = 18
/** Cap insane single-sample speeds from scroll bursts */
const RAIL_GAP_SPEED_CAP = 5.2
const STORY_DURATION_MS = 4200
const CURSOR_IDLE_MS = 1300
const CURSOR_HIDE_DISTANCE = 68

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — shell / portfolio view (ease-out layout; no rubber preview)
 *
 *      0ms   stage shows project asset; story meter cycles ~STORY_DURATION_MS
 *    220ms   info panel blocks + about lead ease in (GSAP)
 *    240ms   squircle radius + info layout + rail reveal (VIEW_RESIZE_MS)
 *    280ms   rail cards finish rise-in (RAIL_CARD_ENTER_MS)
 *    300ms   floating dot arc between thumbs (RAIL_DOT_JUMP_MS)
 *
 * About overlay:
 *      0ms   FLIP: mark translates + scales from header `.identity` (ease-out, GPU)
 *   ~360ms   lead copy fades up (overlap tail of mark — ABOUT_MARK_LEAD_OVERLAP_MS)
 *
 * Info input: trackpad + phone — scroll / swipe down opens, up closes (no horizontal touch).
 * ───────────────────────────────────────────────────────── */
const TIMING = {
  lineRevealMs: 220,
  aboutLineRevealDelayMs: 40,
  /** About h1: FLIP enter from header wordmark (ease-out; under 500ms UI cap) */
  aboutMarkFlipMs: 460,
  /** Bio starts slightly before mark fully settles — reads as one gesture */
  aboutMarkLeadOverlapMs: 140,
  stageInfoMs: VIEW_RESIZE_MS,
  railCardEnterMs: RAIL_CARD_ENTER_MS,
  railDotJumpMs: RAIL_DOT_JUMP_MS,
  storyAdvanceMs: STORY_DURATION_MS,
} as const

type ViewState = {
  projectIndex: number
  assetIndex: number
}

type ViewAction =
  | { type: 'prevAsset' }
  | { type: 'nextAsset' }
  | { type: 'prevProject' }
  | { type: 'nextProject' }
  | { type: 'selectProject'; index: number }

type RailStaggerState = {
  ready: boolean
  stagger: number[]
  visible: boolean[]
}

type CursorZone = 'none' | 'stage' | 'rail'
type CursorDirection = 'left' | 'right' | 'drag'
type CursorUiState = {
  zone: CursorZone
  direction: CursorDirection
  idle: boolean
  proximityHidden: boolean
}

function clampProjectIndex(index: number) {
  return Math.max(0, Math.min(projects.length - 1, index))
}

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'prevAsset') {
    const galleryLength = projects[state.projectIndex].gallery.length
    if (galleryLength <= 1) return state
    return {
      ...state,
      assetIndex: state.assetIndex <= 0 ? galleryLength - 1 : state.assetIndex - 1,
    }
  }

  if (action.type === 'nextAsset') {
    const galleryLength = projects[state.projectIndex].gallery.length
    if (galleryLength <= 1) return state
    return {
      ...state,
      assetIndex: state.assetIndex >= galleryLength - 1 ? 0 : state.assetIndex + 1,
    }
  }

  if (action.type === 'prevProject') {
    if (state.projectIndex <= 0) return state
    return {
      projectIndex: state.projectIndex - 1,
      assetIndex: 0,
    }
  }

  if (action.type === 'nextProject') {
    if (state.projectIndex >= projects.length - 1) return state
    return {
      projectIndex: state.projectIndex + 1,
      assetIndex: 0,
    }
  }

  const nextProjectIndex = clampProjectIndex(action.index)
  if (nextProjectIndex === state.projectIndex) return state
  return {
    projectIndex: nextProjectIndex,
    assetIndex: 0,
  }
}

function wheelPixels(e: WheelEvent) {
  if (e.deltaMode === 1) return { x: e.deltaX * 16, y: e.deltaY * 16 }
  if (e.deltaMode === 2) return { x: e.deltaX * 400, y: e.deltaY * 400 }
  return { x: e.deltaX, y: e.deltaY }
}

function pointToRectDistance(x: number, y: number, rect: DOMRect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return Math.hypot(dx, dy)
}

function warsawClockWithZone(now = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
  const longTz = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Warsaw',
    timeZoneName: 'long',
  })
    .formatToParts(now)
    .find((p) => p.type === 'timeZoneName')?.value
  const isDst = longTz ? /summer|daylight/i.test(longTz) : false
  return `${time} ${isDst ? 'CEST' : 'CET'}`
}

function formatWarsawAboutMeta(now = new Date()) {
  return {
    place: 'Warsaw, Poland',
    clock: warsawClockWithZone(now),
  }
}

type PlainTeaserRect = { top: number; left: number; width: number; height: number }

function serializeTeaserRects(rects: DOMRect[]): PlainTeaserRect[] {
  return rects.map((r) => ({ top: r.top, left: r.left, width: r.width, height: r.height }))
}

export default function PortfolioApp() {
  const [{ projectIndex, assetIndex }, dispatch] = useReducer(viewReducer, {
    projectIndex: 0,
    assetIndex: 0,
  })
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [warsawAboutMeta, setWarsawAboutMeta] = useState(() => formatWarsawAboutMeta())
  const [aboutRevealVersion, setAboutRevealVersion] = useState(0)
  const [railStagger, setRailStagger] = useState<RailStaggerState>({
    ready: false,
    stagger: [],
    visible: [],
  })
  const [isRailDragging, setIsRailDragging] = useState(false)
  const [isCursorPressed, setIsCursorPressed] = useState(false)
  const [cursorUi, setCursorUi] = useState<CursorUiState>({
    zone: 'none',
    direction: 'right',
    idle: false,
    proximityHidden: false,
  })
  const infoWheelAcc = useRef(0)
  const infoWheelAccY = useRef(0)
  const isInfoOpenRef = useRef(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const cursorElRef = useRef<HTMLDivElement>(null)
  const cursorUiRef = useRef<CursorUiState>({
    zone: 'none',
    direction: 'right',
    idle: false,
    proximityHidden: false,
  })
  const cursorIdleTimer = useRef<number | null>(null)
  const railDrag = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
    lastClientX: 0,
    lastTime: 0,
    /** Smoothed d(scrollLeft)/dt in px/ms */
    velocity: 0,
  })
  const railMomentumRaf = useRef<number | null>(null)
  const railTrackRef = useRef<HTMLDivElement>(null)
  const railGapSmoothedRef = useRef(0)
  const railGapRafRef = useRef<number | null>(null)
  const railGapLastFeedRef = useRef(0)
  const railScrollSampleRef = useRef({
    lastLeft: 0,
    lastT: 0,
    /** Detect scrollWidth shrink when gap CSS relaxes (ignore clamp-only deltas) */
    lastScrollWidth: 0,
  })
  const lastRailDragAt = useRef(0)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const railDotAnchorRefs = useRef<(HTMLSpanElement | null)[]>([])
  const railFloatingDotRef = useRef<HTMLDivElement | null>(null)
  const railDotAnimRef = useRef<Animation | null>(null)
  const railDotAnimLockRef = useRef(false)
  /** Last project index after a completed dot move; only updated in onFinish / instant paths — not mid-animation (fixes Strict Mode + off-screen cards). */
  const railDotCommittedProjectIndexRef = useRef(projectIndex)
  const [railDotTranslate, setRailDotTranslate] = useState({ x: 0, y: 0 })
  /** When true, WAAPI owns transform — don't apply React inline translate */
  const [railDotAnimating, setRailDotAnimating] = useState(false)
  const stageWrapRef = useRef<HTMLElement>(null)
  const stageMediaRef = useRef<HTMLImageElement | HTMLVideoElement>(null)
  /** Active story-meter fill — driven directly via DOM when the asset is a video (synced to currentTime/duration). */
  const storyFillRef = useRef<HTMLSpanElement | null>(null)
  const [stageChromeTone, setStageChromeTone] = useState<StageChromeTone>('onDark')
  const stageHitRef = useRef<HTMLDivElement>(null)
  const projectInfoPanelRef = useRef<HTMLElement | null>(null)
  const railWrapRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const aboutOverlayGridRef = useRef<HTMLDivElement | null>(null)
  const identityRef = useRef<HTMLParagraphElement | null>(null)
  const aboutCloseCursorRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const archiveExitTimerRef = useRef<number | null>(null)
  const stageCornerRadiusRef = useRef(0)
  const stageCornerRafRef = useRef<number | null>(null)
  const [stageCornerRadius, setStageCornerRadius] = useState(0)
  const [archiveEntryRects, setArchiveEntryRects] = useState<PlainTeaserRect[] | null>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const archiveOpen = location.hash === '#archive'

  const closeArchive = useCallback(() => {
    runWithViewTransition(() => {
      flushSync(() => {
        navigate({ pathname: '/', hash: '' }, { replace: true })
        setArchiveEntryRects(null)
      })
      const sh = shellRef.current
      sh?.style.removeProperty('--archive-shell-reveal-ms')
      sh?.classList.remove('shell--under-archive', 'shell--archive-revealing', 'shell--archive-exit')
    })
  }, [navigate])

  const startArchiveShellReveal = useCallback((motionDurationMs: number) => {
    const sh = shellRef.current
    if (!sh) return
    sh.style.setProperty('--archive-shell-reveal-ms', `${motionDurationMs}ms`)
    sh.classList.add('shell--archive-revealing')
  }, [])

  const transitionToArchive = useCallback(
    (cardRects: DOMRect[]) => {
      const plain = serializeTeaserRects(cardRects)
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reducedMotion) {
        runWithViewTransition(() => {
          flushSync(() => {
            setArchiveEntryRects(plain)
            navigate({ pathname: '/', hash: 'archive' }, { replace: false })
          })
        })
        return
      }
      const shell = shellRef.current
      const open = () => {
        archiveExitTimerRef.current = null
        runWithViewTransition(() => {
          flushSync(() => {
            setArchiveEntryRects(plain)
            navigate({ pathname: '/', hash: 'archive' }, { replace: false })
          })
        })
      }
      if (!shell) {
        open()
        return
      }
      if (archiveExitTimerRef.current !== null) {
        window.clearTimeout(archiveExitTimerRef.current)
      }
      shell.classList.add('shell--archive-exit')
      archiveExitTimerRef.current = window.setTimeout(open, ARCHIVE_SHELL_EXIT_MS)
    },
    [navigate],
  )

  useLayoutEffect(() => {
    const sh = shellRef.current
    if (!sh || !archiveOpen) return
    sh.classList.remove('shell--archive-exit')
    sh.classList.add('shell--under-archive')
  }, [archiveOpen])

  useEffect(() => {
    if (location.hash === '#archive') return
    startTransition(() => {
      setArchiveEntryRects(null)
    })
    const sh = shellRef.current
    sh?.style.removeProperty('--archive-shell-reveal-ms')
    sh?.classList.remove('shell--under-archive', 'shell--archive-revealing', 'shell--archive-exit')
  }, [location.hash])

  useEffect(
    () => () => {
      if (archiveExitTimerRef.current !== null) {
        window.clearTimeout(archiveExitTimerRef.current)
      }
    },
    [],
  )

  const project = projects[projectIndex]
  const gallery = project.gallery
  const asset = gallery[assetIndex] ?? gallery[0]
  const canStep = gallery.length > 1

  const runChromeSample = useCallback(() => {
    if (USE_COLOR_MEDIA_PLACEHOLDERS) return
    const el = stageMediaRef.current
    if (!el) return
    const next = sampleStageChromeTone(el)
    if (next) {
      setStageChromeTone((prev) => (prev === next ? prev : next))
    }
  }, [])

  const goPrev = useCallback(() => {
    dispatch({ type: 'prevAsset' })
  }, [])

  const goNext = useCallback(() => {
    dispatch({ type: 'nextAsset' })
  }, [])

  const goPrevProject = useCallback(() => {
    dispatch({ type: 'prevProject' })
  }, [])

  const goNextProject = useCallback(() => {
    dispatch({ type: 'nextProject' })
  }, [])

  const selectProject = useCallback((index: number) => {
    dispatch({ type: 'selectProject', index })
  }, [])

  useLayoutEffect(() => {
    let cancelled = false
    let rafAnchor = 0
    let rafSettle1 = 0
    let rafSettle2 = 0
    const ANCHOR_RAF_MAX = 12

    const scheduleStaticSettle = () => {
      rafSettle1 = requestAnimationFrame(() => {
        rafSettle2 = requestAnimationFrame(() => {
          if (cancelled || railDotAnimLockRef.current) return
          const track = railTrackRef.current
          const a = railDotAnchorRefs.current[projectIndex]
          if (!track || !a) return
          setRailDotTranslate(computeRailDotTranslate(track, a))
        })
      })
    }

    const run = (anchorAttempt: number) => {
      const track = railTrackRef.current
      const dot = railFloatingDotRef.current
      if (!track || !dot || cancelled) return
      const anchor = railDotAnchorRefs.current[projectIndex]
      if (!anchor) {
        if (anchorAttempt < ANCHOR_RAF_MAX) {
          rafAnchor = requestAnimationFrame(() => run(anchorAttempt + 1))
        }
        return
      }

      const cardEl = cardRefs.current[projectIndex]
      const from = railDotCommittedProjectIndexRef.current

      if (from === projectIndex) {
        if (cardEl) cardEl.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' })
        const end = computeRailDotTranslate(track, anchor)
        if (!railDotAnimLockRef.current) setRailDotTranslate(end)
        scheduleStaticSettle()
        return
      }

      railDotAnimRef.current?.cancel()
      railDotAnimRef.current = null

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (cardEl) cardEl.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' })
        const end = computeRailDotTranslate(track, anchor)
        setRailDotTranslate(end)
        setRailDotAnimating(false)
        railDotCommittedProjectIndexRef.current = projectIndex
        return
      }

      if (cardEl) cardEl.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' })
      const end = computeRailDotTranslate(track, anchor)
      const start = getRailDotTranslateFromVisual(track, dot)

      railDotAnimLockRef.current = true
      setRailDotAnimating(true)
      const keyframes = buildRailDotJumpKeyframes(start, end, 16)
      const anim = dot.animate(keyframes, {
        duration: RAIL_DOT_JUMP_MS,
        easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
        fill: 'forwards',
      })
      railDotAnimRef.current = anim
      const onFinish = () => {
        railDotAnimRef.current = null
        railDotAnimLockRef.current = false
        setRailDotTranslate(end)
        setRailDotAnimating(false)
        railDotCommittedProjectIndexRef.current = projectIndex
      }
      const onCancel = () => {
        railDotAnimRef.current = null
        railDotAnimLockRef.current = false
        setRailDotAnimating(false)
        const t = railTrackRef.current
        const d = railFloatingDotRef.current
        if (t && d) setRailDotTranslate(getRailDotTranslateFromVisual(t, d))
      }
      anim.onfinish = onFinish
      anim.oncancel = onCancel
    }

    run(0)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafAnchor)
      cancelAnimationFrame(rafSettle1)
      cancelAnimationFrame(rafSettle2)
      const hadAnim = railDotAnimRef.current != null
      railDotAnimRef.current?.cancel()
      if (!hadAnim && railDotAnimLockRef.current) {
        railDotAnimLockRef.current = false
      }
    }
  }, [projectIndex, isInfoOpen, railStagger.ready])

  useEffect(() => {
    const onResize = () => {
      if (railDotAnimLockRef.current) return
      const track = railTrackRef.current
      const a = railDotAnchorRefs.current[projectIndex]
      if (!track || !a) return
      setRailDotTranslate(computeRailDotTranslate(track, a))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [projectIndex])

  /* Cards with `railCardEnter` move vertically; re-measure until enter animation finishes. */
  const railStaggerOrder = railStagger.stagger[projectIndex] ?? 0
  useEffect(() => {
    if (!isInfoOpen || !railStagger.ready) return

    const delayMs = railStaggerOrder * (VIEW_RESIZE_MS / RAIL_STAGGER_TIME_DIVISOR)
    const followMs = delayMs + RAIL_CARD_ENTER_MS + 100

    let rafId = 0
    const t0 = performance.now()

    const tick = () => {
      if (performance.now() - t0 > followMs) return
      if (!railDotAnimLockRef.current) {
        const track = railTrackRef.current
        const a = railDotAnchorRefs.current[projectIndex]
        if (track && a) setRailDotTranslate(computeRailDotTranslate(track, a))
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isInfoOpen, railStagger.ready, projectIndex, railStaggerOrder])

  const cancelRailMomentum = useCallback(() => {
    if (railMomentumRaf.current !== null) {
      cancelAnimationFrame(railMomentumRaf.current)
      railMomentumRaf.current = null
    }
    railRef.current?.classList.remove('rail--momentum')
  }, [])

  const cancelRailGapDynamics = useCallback(() => {
    if (railGapRafRef.current !== null) {
      cancelAnimationFrame(railGapRafRef.current)
      railGapRafRef.current = null
    }
    railGapSmoothedRef.current = 0
    railTrackRef.current?.style.setProperty('--rail-gap-extra', '0px')
  }, [])

  const ensureRailGapDecay = useCallback(() => {
    if (railGapRafRef.current !== null) return
    const tick = () => {
      const now = performance.now()
      if (now - railGapLastFeedRef.current < RAIL_GAP_IDLE_MS) {
        railGapRafRef.current = requestAnimationFrame(tick)
        return
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cancelRailGapDynamics()
        return
      }
      const v = railGapSmoothedRef.current
      let next = v * (v > 0.2 ? RAIL_GAP_DECAY : RAIL_GAP_DECAY_TAIL)
      if (next < RAIL_GAP_SNAP) next = 0
      railGapSmoothedRef.current = next
      const el = railTrackRef.current
      if (el) {
        el.style.setProperty('--rail-gap-extra', `${next * RAIL_GAP_MAX_EXTRA_PX}px`)
      }
      if (next === 0) {
        railGapRafRef.current = null
        return
      }
      railGapRafRef.current = requestAnimationFrame(tick)
    }
    railGapRafRef.current = requestAnimationFrame(tick)
  }, [cancelRailGapDynamics])

  const feedRailGapFromScrollSpeed = useCallback(
    (speedPxPerMs: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const speed = Math.min(RAIL_GAP_SPEED_CAP, Math.abs(speedPxPerMs))
      const t = Math.min(1, speed / RAIL_GAP_SPEED_REF)
      const prev = railGapSmoothedRef.current
      railGapSmoothedRef.current = prev + (t - prev) * RAIL_GAP_SMOOTH
      railGapLastFeedRef.current = performance.now()
      const el = railTrackRef.current
      if (el) {
        el.style.setProperty('--rail-gap-extra', `${railGapSmoothedRef.current * RAIL_GAP_MAX_EXTRA_PX}px`)
      }
      ensureRailGapDecay()
    },
    [ensureRailGapDecay],
  )

  const feedRailGapWheelImpulse = useCallback(
    (wheelDeltaPx: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const t = Math.min(1, wheelDeltaPx / RAIL_GAP_WHEEL_REF)
      const prev = railGapSmoothedRef.current
      railGapSmoothedRef.current = Math.max(prev + (t - prev) * 0.48, t * 0.82)
      railGapLastFeedRef.current = performance.now()
      const el = railTrackRef.current
      if (el) {
        el.style.setProperty('--rail-gap-extra', `${railGapSmoothedRef.current * RAIL_GAP_MAX_EXTRA_PX}px`)
      }
      ensureRailGapDecay()
    },
    [ensureRailGapDecay],
  )

  const startRailMomentum = useCallback(
    (rail: HTMLDivElement, velocityPxPerMs: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      let v = velocityPxPerMs * RAIL_MOMENTUM_BOOST
      if (Math.abs(v) < RAIL_MOMENTUM_MIN_VELOCITY) return

      cancelRailMomentum()
      rail.classList.add('rail--momentum')
      let last = performance.now()

      const maxScroll = () => Math.max(0, rail.scrollWidth - rail.clientWidth)

      const step = (now: number) => {
        const dt = Math.min(48, now - last)
        last = now
        if (dt <= 0) {
          railMomentumRaf.current = requestAnimationFrame(step)
          return
        }

        const m = maxScroll()
        const prev = rail.scrollLeft
        let next = prev + v * dt
        if (next < 0) {
          next = 0
          v = 0
        } else if (next > m) {
          next = m
          v = 0
        } else {
          v *= Math.pow(RAIL_MOMENTUM_FRICTION, dt / 16)
        }
        rail.scrollLeft = next

        if (Math.abs(v) < RAIL_MOMENTUM_STOP) {
          cancelRailMomentum()
          return
        }
        railMomentumRaf.current = requestAnimationFrame(step)
      }

      railMomentumRaf.current = requestAnimationFrame(step)
    },
    [cancelRailMomentum],
  )

  const resetRailPointer = useCallback(() => {
    if (!railDrag.current.active) return
    const pointerId = railDrag.current.pointerId
    const rail = railRef.current
    if (pointerId >= 0 && rail?.hasPointerCapture(pointerId)) {
      rail.releasePointerCapture(pointerId)
    }
    railDrag.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
      lastClientX: 0,
      lastTime: 0,
      velocity: 0,
    }
    setIsRailDragging(false)
  }, [])

  const openInfo = useCallback(() => {
    infoWheelAcc.current = 0
    infoWheelAccY.current = 0
    setIsInfoOpen(true)
  }, [])

  const closeInfo = useCallback(() => {
    infoWheelAcc.current = 0
    infoWheelAccY.current = 0
    setIsInfoOpen(false)
    cancelRailMomentum()
    cancelRailGapDynamics()
    resetRailPointer()
  }, [cancelRailGapDynamics, cancelRailMomentum, resetRailPointer])

  const toggleAbout = useCallback(() => {
    setIsAboutOpen((prev) => {
      const next = !prev
      if (next) setAboutRevealVersion((v) => v + 1)
      return next
    })
  }, [])

  const closeAbout = useCallback(() => {
    setIsAboutOpen(false)
  }, [])

  useEffect(() => {
    const tick = () => setWarsawAboutMeta(formatWarsawAboutMeta())
    tick()
    const timer = window.setInterval(tick, 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isInfoOpen) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const panel = projectInfoPanelRef.current
    if (!panel) return
    let disposed = false
    let rafOuter = 0
    let rafInner = 0
    rafOuter = requestAnimationFrame(() => {
      rafInner = requestAnimationFrame(() => {
        const blocks = Array.from(panel.querySelectorAll<HTMLElement>('[data-info-reveal="block"]'))
        if (!blocks.length || disposed) return
        gsap.killTweensOf(blocks)
        gsap.set(blocks, { autoAlpha: 0, y: 4 })
        gsap.to(blocks, {
          autoAlpha: 1,
          y: 0,
          duration: TIMING.lineRevealMs / 1000,
          ease: 'power1.out',
          stagger: 0.04,
          overwrite: 'auto',
        })
      })
    })
    return () => {
      disposed = true
      cancelAnimationFrame(rafOuter)
      cancelAnimationFrame(rafInner)
    }
  }, [isInfoOpen, project.id, project.description, project.category])

  useEffect(() => {
    if (!isAboutOpen) return
    const grid = aboutOverlayGridRef.current
    if (!grid) return
    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let disposed = false
    let raf1 = 0
    let raf2 = 0
    let raf3 = 0
    let tl: gsap.core.Timeline | null = null

    const run = () => {
      if (disposed) return
      const identityEl = identityRef.current
      const mark = grid.querySelector<HTMLElement>('.aboutOverlayMark')
      const lead = grid.querySelector<HTMLElement>('[data-about-reveal="block"]')
      if (!lead || !mark) return

      gsap.killTweensOf([mark, lead])

      if (reducedMotion) {
        gsap.set(mark, { clearProps: 'transform' })
        gsap.set(lead, { autoAlpha: 1, y: 0 })
        return
      }

      if (!identityEl) {
        gsap.set(mark, { clearProps: 'transform' })
        gsap.set(lead, { autoAlpha: 0, y: 10 })
        gsap.to(lead, {
          autoAlpha: 1,
          y: 0,
          duration: TIMING.lineRevealMs / 1000,
          ease: 'power1.out',
          delay: TIMING.aboutLineRevealDelayMs / 1000,
          overwrite: 'auto',
        })
        return
      }

      const from = identityEl.getBoundingClientRect()
      const to = mark.getBoundingClientRect()
      const inv = computeAboutMarkFlipInvert(from, to)

      if (!inv || to.width < 2 || to.height < 2) {
        gsap.set(mark, { clearProps: 'transform' })
        gsap.set(lead, { autoAlpha: 0, y: 10 })
        gsap.to(lead, {
          autoAlpha: 1,
          y: 0,
          duration: TIMING.lineRevealMs / 1000,
          ease: 'power1.out',
          delay: TIMING.aboutLineRevealDelayMs / 1000,
          overwrite: 'auto',
        })
        return
      }

      /* Enter = ease-out (animations.dev); only transform + opacity on lead */
      tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
      tl.fromTo(
        mark,
        {
          x: inv.dx,
          y: inv.dy,
          scale: inv.scale,
          transformOrigin: '0% 0%',
          immediateRender: true,
        },
        {
          x: 0,
          y: 0,
          scale: 1,
          duration: TIMING.aboutMarkFlipMs / 1000,
          ease: 'power2.out',
          transformOrigin: '0% 0%',
        },
      ).fromTo(
        lead,
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: TIMING.lineRevealMs / 1000,
          ease: 'power1.out',
        },
        `-=${TIMING.aboutMarkLeadOverlapMs / 1000}`,
      )
    }

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        raf3 = requestAnimationFrame(run)
      })
    })

    return () => {
      disposed = true
      tl?.kill()
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      cancelAnimationFrame(raf3)
      const mark = grid.querySelector<HTMLElement>('.aboutOverlayMark')
      const lead = grid.querySelector<HTMLElement>('[data-about-reveal="block"]')
      if (mark) gsap.killTweensOf(mark)
      if (lead) gsap.killTweensOf(lead)
    }
  }, [isAboutOpen, aboutRevealVersion])

  useEffect(() => {
    isInfoOpenRef.current = isInfoOpen
  }, [isInfoOpen])

  /** Animate stage squircle radius with layout (clip-path can’t transition in CSS) */
  useEffect(() => {
    const target = isInfoOpen ? PROJECT_MEDIA_RADIUS : 0
    const from = stageCornerRadiusRef.current

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (stageCornerRafRef.current !== null) {
        cancelAnimationFrame(stageCornerRafRef.current)
        stageCornerRafRef.current = null
      }
      stageCornerRadiusRef.current = target
      startTransition(() => {
        setStageCornerRadius(target)
      })
      return
    }

    if (stageCornerRafRef.current !== null) {
      cancelAnimationFrame(stageCornerRafRef.current)
      stageCornerRafRef.current = null
    }

    if (Math.abs(from - target) < 0.001) {
      stageCornerRadiusRef.current = target
      startTransition(() => {
        setStageCornerRadius(target)
      })
      return
    }

    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const t = Math.min(1, elapsed / VIEW_RESIZE_MS)
      const eased = easeViewInset(t)
      const v = from + (target - from) * eased
      stageCornerRadiusRef.current = v
      setStageCornerRadius(v)
      if (t < 1) {
        stageCornerRafRef.current = requestAnimationFrame(tick)
      } else {
        stageCornerRafRef.current = null
        stageCornerRadiusRef.current = target
        setStageCornerRadius(target)
      }
    }

    stageCornerRafRef.current = requestAnimationFrame(tick)

    return () => {
      if (stageCornerRafRef.current !== null) {
        cancelAnimationFrame(stageCornerRafRef.current)
        stageCornerRafRef.current = null
      }
    }
  }, [isInfoOpen])

  useEffect(() => {
    cursorUiRef.current = cursorUi
  }, [cursorUi])

  useEffect(
    () => () => {
      cancelRailMomentum()
      cancelRailGapDynamics()
    },
    [cancelRailGapDynamics, cancelRailMomentum],
  )

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const now = performance.now()
    railScrollSampleRef.current = {
      lastLeft: rail.scrollLeft,
      lastT: now,
      lastScrollWidth: rail.scrollWidth,
    }
    const onScroll = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const ts = performance.now()
      const left = rail.scrollLeft
      const st = railScrollSampleRef.current
      const dt = ts - st.lastT
      const d = left - st.lastLeft
      const scrollWidth = rail.scrollWidth
      const maxS = Math.max(0, scrollWidth - rail.clientWidth)

      // When gap shrinks, scrollWidth drops and the browser clamps scrollLeft — ignore that delta
      if (st.lastScrollWidth > 0 && scrollWidth < st.lastScrollWidth - 0.5) {
        const lost = st.lastScrollWidth - scrollWidth
        if (Math.abs(d) <= lost + 8 && Math.abs(d) < 28) {
          st.lastScrollWidth = scrollWidth
          st.lastLeft = left
          st.lastT = ts
          return
        }
      }
      st.lastScrollWidth = scrollWidth

      if (dt < 5 || dt > 95) {
        st.lastLeft = left
        st.lastT = ts
        return
      }

      const edgePx = 3
      const atStart = left <= edgePx
      const atEnd = left >= maxS - edgePx
      if (atStart || atEnd) {
        if (Math.abs(d) < 3) {
          st.lastLeft = left
          st.lastT = ts
          return
        }
        if (atStart && d < 0) {
          st.lastLeft = left
          st.lastT = ts
          return
        }
        if (atEnd && d > 0) {
          st.lastLeft = left
          st.lastT = ts
          return
        }
      }

      const speed = Math.abs(d / dt)
      st.lastLeft = left
      st.lastT = ts
      if (speed < 0.022) return
      feedRailGapFromScrollSpeed(speed)
    }
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => rail.removeEventListener('scroll', onScroll)
  }, [feedRailGapFromScrollSpeed])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const now = performance.now()
    railScrollSampleRef.current = {
      lastLeft: rail.scrollLeft,
      lastT: now,
      lastScrollWidth: rail.scrollWidth,
    }
  }, [projectIndex])

  const isNearCursorHideTarget = useCallback((x: number, y: number) => {
    const targets = document.querySelectorAll<HTMLElement>('[data-cursor-hide="true"]')
    for (const target of targets) {
      const rect = target.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (pointToRectDistance(x, y, rect) <= CURSOR_HIDE_DISTANCE) {
        return true
      }
    }
    return false
  }, [])

  const endRailDrag = useCallback(
    (pointerId: number) => {
      const drag = railDrag.current
      if (!drag.active || drag.pointerId !== pointerId) return
      const rail = railRef.current
      if (rail?.hasPointerCapture(pointerId)) {
        rail.releasePointerCapture(pointerId)
      }
      const releaseVel = drag.moved ? drag.velocity : 0
      if (drag.moved) {
        lastRailDragAt.current = Date.now()
      }
      railDrag.current = {
        active: false,
        pointerId: -1,
        startX: 0,
        startScrollLeft: 0,
        moved: false,
        lastClientX: 0,
        lastTime: 0,
        velocity: 0,
      }
      setIsRailDragging(false)
      if (
        rail &&
        Math.abs(releaseVel * RAIL_MOMENTUM_BOOST) >= RAIL_MOMENTUM_MIN_VELOCITY
      ) {
        startRailMomentum(rail, releaseVel)
      }
    },
    [startRailMomentum],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isAboutOpen) {
        e.preventDefault()
        closeAbout()
        return
      }

      if (e.key === 'Escape' && isInfoOpen) {
        e.preventDefault()
        closeInfo()
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrevProject()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNextProject()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        openInfo()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        closeInfo()
      } else if (e.key === 'Home') {
        e.preventDefault()
        selectProject(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        selectProject(projects.length - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeAbout, closeInfo, goPrevProject, goNextProject, isAboutOpen, isInfoOpen, openInfo, selectProject])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const { x: px, y: py } = wheelPixels(e)
      const ax = Math.abs(px)
      const ay = Math.abs(py)
      if (ax < 0.5 && ay < 0.5) return

      if (isAboutOpen) {
        return
      }

      /* Archive overlay is portaled to body; let .archiveScroll use native overflow (we use passive: false below). */
      if (archiveOpen) {
        return
      }

      const targetNode = e.target instanceof Node ? e.target : null
      const isOnRail = targetNode ? railWrapRef.current?.contains(targetNode) : false

      if (isOnRail && isInfoOpen) {
        const horizontalIntent =
          (ax >= RAIL_WHEEL_X_MIN && ax >= ay * RAIL_HORIZONTAL_RATIO) ||
          (e.shiftKey && ay >= RAIL_WHEEL_X_MIN)

        if (horizontalIntent) {
          const rail = railRef.current
          if (!rail) return
          feedRailGapWheelImpulse(Math.hypot(ax, ay))
          if (e.shiftKey && ay > ax) {
            e.preventDefault()
            rail.scrollLeft += py
          }
          infoWheelAcc.current = 0
          infoWheelAccY.current = 0
          return
        }

        if (ay < ax * VERTICAL_INTENT_RATIO) return
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const wheelCommitPx = reducedMotion ? INFO_WHEEL_STEP : INFO_COMMIT_WHEEL_ACC

      const horizontalIntent = ax > ay
      if (!isOnRail && horizontalIntent) {
        e.preventDefault()
        infoWheelAccY.current = 0
        infoWheelAcc.current += px
        const acc = infoWheelAcc.current
        const open = isInfoOpenRef.current
        if ((!open && acc > 0) || (open && acc < 0)) {
          infoWheelAcc.current = 0
          return
        }
        if (Math.abs(acc) < wheelCommitPx) return
        infoWheelAcc.current = 0
        if (!open && acc < 0) openInfo()
        else if (open && acc > 0) closeInfo()
        return
      }

      if (ay <= ax * VERTICAL_INTENT_RATIO) return

      if (
        wheelShouldDeferToInfoPanelScroll(
          targetNode,
          py,
          projectInfoPanelRef.current,
          isInfoOpenRef.current,
        )
      ) {
        return
      }

      e.preventDefault()
      infoWheelAcc.current = 0
      infoWheelAccY.current += py
      const accY = infoWheelAccY.current
      const open = isInfoOpenRef.current
      if ((!open && accY < 0) || (open && accY > 0)) {
        infoWheelAccY.current = 0
        return
      }
      if (Math.abs(accY) < wheelCommitPx) return
      infoWheelAccY.current = 0
      if (!open && accY > 0) openInfo()
      else if (open && accY < 0) closeInfo()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [archiveOpen, closeInfo, feedRailGapWheelImpulse, isAboutOpen, isInfoOpen, openInfo])

  useEffect(() => {
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!finePointerQuery.matches) return

    const updateCursorUi = (patch: Partial<CursorUiState>) => {
      const current = cursorUiRef.current
      const next: CursorUiState = {
        zone: patch.zone ?? current.zone,
        direction: patch.direction ?? current.direction,
        idle: patch.idle ?? current.idle,
        proximityHidden: patch.proximityHidden ?? current.proximityHidden,
      }
      if (
        next.zone === current.zone &&
        next.direction === current.direction &&
        next.idle === current.idle &&
        next.proximityHidden === current.proximityHidden
      ) {
        return
      }
      cursorUiRef.current = next
      setCursorUi(next)
    }

    const resetIdleTimer = () => {
      if (cursorIdleTimer.current !== null) {
        window.clearTimeout(cursorIdleTimer.current)
      }
      cursorIdleTimer.current = window.setTimeout(() => {
        const current = cursorUiRef.current
        if (current.zone === 'none' || current.proximityHidden) return
        updateCursorUi({ idle: true })
      }, CURSOR_IDLE_MS)
    }

    const onPointerMove = (e: PointerEvent) => {
      const cursorEl = cursorElRef.current
      if (cursorEl) {
        cursorEl.style.left = `${e.clientX}px`
        cursorEl.style.top = `${e.clientY}px`
      }
      const aboutCursorEl = aboutCloseCursorRef.current
      if (aboutCursorEl && isAboutOpen) {
        aboutCursorEl.style.left = `${e.clientX}px`
        aboutCursorEl.style.top = `${e.clientY}px`
      }

      const target = e.target instanceof Node ? e.target : null
      const onStage =
        !!target &&
        (stageWrapRef.current?.contains(target) === true || stageHitRef.current?.contains(target) === true)
      const onRail = !!target && railWrapRef.current?.contains(target) === true

      let zone: CursorZone = 'none'
      if (onStage) zone = 'stage'
      else if (onRail) zone = 'none'

      let direction: CursorDirection = cursorUiRef.current.direction
      if (zone === 'stage') {
        const rect = stageWrapRef.current?.getBoundingClientRect()
        const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
        direction = e.clientX < centerX ? 'left' : 'right'
      }

      const proximityHidden = zone === 'none' ? false : isNearCursorHideTarget(e.clientX, e.clientY)
      updateCursorUi({
        zone,
        direction,
        idle: false,
        proximityHidden,
      })

      if (zone === 'none') {
        if (cursorIdleTimer.current !== null) {
          window.clearTimeout(cursorIdleTimer.current)
          cursorIdleTimer.current = null
        }
        return
      }
      resetIdleTimer()
    }

    const onPointerLeaveWindow = (e: MouseEvent) => {
      if (e.relatedTarget) return
      updateCursorUi({
        zone: 'none',
        idle: false,
        proximityHidden: false,
      })
      setIsCursorPressed(false)
      if (cursorIdleTimer.current !== null) {
        window.clearTimeout(cursorIdleTimer.current)
        cursorIdleTimer.current = null
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      if (cursorUiRef.current.zone === 'none') return
      setIsCursorPressed(true)
    }

    const onPointerUp = () => {
      setIsCursorPressed(false)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('mouseout', onPointerLeaveWindow)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('blur', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('mouseout', onPointerLeaveWindow)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('blur', onPointerUp)
      if (cursorIdleTimer.current !== null) {
        window.clearTimeout(cursorIdleTimer.current)
        cursorIdleTimer.current = null
      }
    }
  }, [isAboutOpen, isNearCursorHideTarget])

  useLayoutEffect(() => {
    if (!isInfoOpen) {
      startTransition(() => {
        setRailStagger({ ready: false, stagger: [], visible: [] })
      })
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const n = projects.length
      startTransition(() => {
        setRailStagger({
          ready: true,
          stagger: Array.from({ length: n }, (_, i) => i),
          visible: Array<boolean>(n).fill(true),
        })
      })
      return
    }

    let cancelled = false
    let raf2 = 0

    const measureRailStagger = () => {
      if (cancelled) return
      const rail = railRef.current
      if (!rail) return
      const railRect = rail.getBoundingClientRect()
      const n = projects.length
      const stagger = new Array<number>(n).fill(0)
      const visible = new Array<boolean>(n).fill(false)
      const items: { i: number; left: number }[] = []

      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i]
        if (!el) continue
        const r = el.getBoundingClientRect()
        const pad = 2
        if (r.width > 0 && r.right > railRect.left + pad && r.left < railRect.right - pad) {
          visible[i] = true
          items.push({ i, left: r.left })
        }
      }
      items.sort((a, b) => a.left - b.left)
      items.forEach((item, order) => {
        stagger[item.i] = order
      })

      /* While the rail is still sliding in, rects often miss the viewport → no items → all delays stay 0. */
      if (items.length === 0) {
        for (let i = 0; i < n; i++) {
          stagger[i] = i
          visible[i] = true
        }
      }

      setRailStagger({ ready: true, stagger, visible })
    }

    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measureRailStagger)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [isInfoOpen])

  useLayoutEffect(() => {
    if (USE_COLOR_MEDIA_PLACEHOLDERS) return
    let raf = 0
    raf = requestAnimationFrame(() => {
      runChromeSample()
    })
    return () => cancelAnimationFrame(raf)
  }, [asset, isInfoOpen, projectIndex, assetIndex, runChromeSample])

  useEffect(() => {
    if (USE_COLOR_MEDIA_PLACEHOLDERS) return
    const wrap = stageWrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      runChromeSample()
    })
    ro.observe(wrap)
    window.addEventListener('resize', runChromeSample)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', runChromeSample)
    }
  }, [runChromeSample])

  useEffect(() => {
    if (USE_COLOR_MEDIA_PLACEHOLDERS) return
    if (asset.kind !== 'video') return
    const el = stageMediaRef.current
    if (!(el instanceof HTMLVideoElement)) return
    const v = el
    let handle = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      runChromeSample()
      if ('requestVideoFrameCallback' in v) {
        handle = v.requestVideoFrameCallback(tick)
      }
    }

    if ('requestVideoFrameCallback' in v) {
      handle = v.requestVideoFrameCallback(tick)
      return () => {
        cancelled = true
        v.cancelVideoFrameCallback(handle)
      }
    }

    const onTime = () => runChromeSample()
    el.addEventListener('timeupdate', onTime)
    return () => {
      cancelled = true
      el.removeEventListener('timeupdate', onTime)
    }
  }, [asset, runChromeSample])

  /* Preload every image in the active gallery so step-throughs (manual or auto)
   * resolve their decode immediately — keeps the previous frame visible during
   * the swap and prevents background flashes through the squircle. */
  useEffect(() => {
    if (USE_COLOR_MEDIA_PLACEHOLDERS) return
    for (const entry of gallery) {
      if (entry.kind !== 'image') continue
      const image = new Image()
      image.decoding = 'async'
      image.src = entry.src
    }
  }, [gallery])

  useEffect(() => {
    if (!canStep) return

    // Image: keep the constant story duration (CSS keyframes drive the fill).
    if (asset.kind !== 'video') {
      const timer = window.setTimeout(() => {
        goNext()
      }, STORY_DURATION_MS)
      return () => window.clearTimeout(timer)
    }

    // Video: drive the meter from the playhead each frame, advance on `ended`.
    // The video element is fed a blob URL by `useResolvedVideoSrc`, so `duration`
    // is always finite by the time `loadedmetadata` fires — no probing needed.
    const el = stageMediaRef.current
    if (!(el instanceof HTMLVideoElement)) {
      const timer = window.setTimeout(() => goNext(), STORY_DURATION_MS)
      return () => window.clearTimeout(timer)
    }
    const v = el

    let cancelled = false
    let advanced = false
    let raf = 0
    /** Watchdog so a broken/unfetchable clip can never permanently stall the slide. */
    const watchdog = window.setTimeout(() => advance(), 60_000)

    const writeFill = (p: number) => {
      const node = storyFillRef.current
      if (!node) return
      const clamped = p < 0 ? 0 : p > 1 ? 1 : p
      node.style.transform = `scaleX(${clamped})`
    }

    function advance() {
      if (advanced || cancelled) return
      advanced = true
      writeFill(1)
      goNext()
    }

    const tick = () => {
      if (cancelled) return
      const d = v.duration
      if (Number.isFinite(d) && d > 0) {
        writeFill(v.currentTime / d)
      }
      raf = requestAnimationFrame(tick)
    }

    const onEnded = () => advance()
    v.addEventListener('ended', onEnded)

    writeFill(0)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearTimeout(watchdog)
      v.removeEventListener('ended', onEnded)
    }
  }, [asset, assetIndex, canStep, goNext, projectIndex])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (isAboutOpen) return
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }, [isAboutOpen])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (isAboutOpen) return
      if (e.touches.length !== 1) return
      const target = e.target as Node
      const start = touchStart.current
      if (!start) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)
      const isOnRail = railWrapRef.current?.contains(target) === true

      // Rail: horizontal drag scrolls thumbnails; touch never drives info open/close on X.
      if (isOnRail && absX >= absY && absX > 12) return

      if (
        touchVerticalShouldDeferToInfoPanelScroll(
          target,
          deltaY,
          absX,
          absY,
          projectInfoPanelRef.current,
          isInfoOpen,
        )
      ) {
        return
      }
    },
    [isAboutOpen, isInfoOpen],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (isAboutOpen) return
      const start = touchStart.current
      touchStart.current = null
      if (!start || e.changedTouches.length === 0) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const endTarget = e.target instanceof Node ? e.target : null

      const verticalDominant = absY >= absX

      if (verticalDominant && absY >= 12) {
        if (
          touchEndVerticalIsPanelScrollNotClose(
            deltaY,
            absX,
            absY,
            endTarget,
            projectInfoPanelRef.current,
            isInfoOpen,
          )
        ) {
          return
        }
        const commitPx = reducedMotion ? SWIPE_STEP : INFO_SWIPE_COMMIT_PY
        if (absY < commitPx) return
        if (!isInfoOpen && deltaY > commitPx) openInfo()
        else if (isInfoOpen && deltaY < -commitPx) closeInfo()
        return
      }

      if (absX > absY && absX >= 12) return

      if (Math.max(absX, absY) < SWIPE_STEP) return
    },
    [closeInfo, isAboutOpen, isInfoOpen, openInfo],
  )

  const handleRailPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isInfoOpen) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const rail = railRef.current
      if (!rail) return
      cancelRailMomentum()
      railDrag.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: rail.scrollLeft,
        moved: false,
        lastClientX: e.clientX,
        lastTime: 0,
        velocity: 0,
      }
    },
    [cancelRailMomentum, isInfoOpen],
  )

  const handleRailPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = railDrag.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    const rail = railRef.current
    if (!rail) return

    const deltaX = e.clientX - drag.startX
    if (!drag.moved && Math.abs(deltaX) < DRAG_START_PX) {
      return
    }

    if (!drag.moved) {
      drag.moved = true
      setIsRailDragging(true)
      rail.setPointerCapture(e.pointerId)
      drag.lastClientX = e.clientX
      drag.lastTime = performance.now()
      drag.velocity = 0
    } else {
      const now = performance.now()
      const dt = now - drag.lastTime
      if (dt > 0 && drag.lastTime > 0) {
        const inst = -(e.clientX - drag.lastClientX) / dt
        drag.velocity =
          RAIL_VELOCITY_SMOOTH * inst + (1 - RAIL_VELOCITY_SMOOTH) * drag.velocity
      }
      drag.lastClientX = e.clientX
      drag.lastTime = now
    }

    rail.scrollLeft = drag.startScrollLeft - deltaX
  }, [])

  const handleRailPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endRailDrag(e.pointerId)
    },
    [endRailDrag],
  )

  const handleRailPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endRailDrag(e.pointerId)
    },
    [endRailDrag],
  )

  const handleRailPointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = railDrag.current
    if (!drag.active || drag.pointerId !== e.pointerId || drag.moved) return
    railDrag.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
      lastClientX: 0,
      lastTime: 0,
      velocity: 0,
    }
  }, [])

  const stageLabel = useMemo(() => {
    if (!canStep) return `${project.label} — 1 / 1`
    return `${project.label} — ${assetIndex + 1} / ${gallery.length}`
  }, [assetIndex, canStep, gallery.length, project.label])

  const infoDescription = useMemo(
    () => splitProjectDescription(project.description ?? defaultProjectDescription),
    [project.description],
  )

  const cursorClassName = [
    'customCursor',
    cursorUi.zone !== 'none' ? 'customCursor--visible' : '',
    isCursorPressed ? 'customCursor--pressed' : '',
    cursorUi.idle ? 'customCursor--idle' : '',
    cursorUi.proximityHidden ? 'customCursor--proximity' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={shellRef}
      className={`shell ${isInfoOpen ? 'shell--info' : ''} ${isAboutOpen ? 'shell--about' : ''} ${
        stageChromeTone === 'onLight' ? 'shell--chrome-on-light' : 'shell--chrome-on-dark'
      }`}
      aria-hidden={archiveOpen}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="fullBleed">
        <div className="fullBleedInner">
        {/* Panel before stage so row order stays info | stage without flex order (fixes panel jumping right when closing). */}
        <aside
          id="project-info-panel"
          ref={projectInfoPanelRef}
          className="projectInfoPanel"
          aria-hidden={!isInfoOpen}
        >
          <div className="projectInfoInner">
            <div className="projectInfoHead">
              <h2 className="projectInfoTitle" data-info-reveal="block">
                {project.label}
              </h2>
              <p className="projectInfoCategory" data-info-reveal="block">
                {project.category ?? defaultProjectCategory}
              </p>
            </div>
            <ProjectInfoBody
              key={`${project.id}-desc-0`}
              className="projectInfoBody"
              text={infoDescription[0]}
            />
            {infoDescription[1] ? (
              <ProjectInfoBody
                key={`${project.id}-desc-1`}
                className="projectInfoBody"
                text={infoDescription[1]}
              />
            ) : null}
          </div>
        </aside>

        <section
          className="stageMediaWrap"
          ref={stageWrapRef}
          aria-label={`Project preview for ${project.label}`}
          onClick={(e) => {
            if (!canStep) return
            const rect = e.currentTarget.getBoundingClientRect()
            const centerX = rect.left + rect.width / 2
            if (e.clientX < centerX) goPrev()
            else goNext()
          }}
        >
          <div className="stageMedia">
            {asset && (
              <Squircle
                cornerRadius={Math.max(0, stageCornerRadius)}
                cornerSmoothing={stageCornerRadius > 0.5 ? 1 : 0}
                className="stageMediaSquircle"
              >
                <GalleryStage
                  ref={stageMediaRef}
                  media={asset}
                  fit="cover"
                  loop={!canStep}
                  onMediaDecoded={runChromeSample}
                />
                <SquircleMediaStroke
                  cornerRadius={Math.max(0, stageCornerRadius)}
                  cornerSmoothing={stageCornerRadius > 0.5 ? 1 : 0}
                />
              </Squircle>
            )}
            <div className="storyMeter" aria-hidden>
              {gallery.map((slot, i) => {
                const done = i < assetIndex
                const active = i === assetIndex
                const activeIsVideo = active && slot.kind === 'video'
                const animateFill = active && !activeIsVideo
                return (
                  <span
                    key={`${project.id}-story-${i}`}
                    className={`storySegment ${active ? 'storySegment--active' : ''} ${done ? 'storySegment--done' : ''}`}
                  >
                    <span
                      key={`${project.id}-storyfill-${i}-${active ? `${assetIndex}-${slot.kind}` : 'idle'}`}
                      ref={active ? storyFillRef : null}
                      className={`storyFill ${done ? 'storyFill--done' : ''} ${animateFill ? 'storyFill--active' : ''}`}
                      style={animateFill ? { animationDuration: `${STORY_DURATION_MS}ms` } : undefined}
                    />
                  </span>
                )
              })}
            </div>
          </div>
        </section>
        </div>
      </div>

      {canStep && (
        <div className="hitOverlay" ref={stageHitRef}>
          <button
            type="button"
            className="hit hitLeft"
            onClick={goPrev}
            aria-label="Previous project file"
          />
          <button
            type="button"
            className="hit hitRight"
            onClick={goNext}
            aria-label="Next project file"
          />
        </div>
      )}

      <header className="topBar">
        <div className="topBarLead">
          <p ref={identityRef} className="identity" aria-hidden={isAboutOpen}>
            fuksfranek
          </p>
          <button
            type="button"
            className={`identityDots ${isAboutOpen ? 'identityDots--active identityDots--stolen' : ''}`}
            aria-label={isAboutOpen ? 'Close about overlay' : 'Open about overlay'}
            aria-expanded={isAboutOpen}
            aria-controls="about-overlay"
            onClick={toggleAbout}
            data-cursor-hide="true"
          >
            <span className="identityIconSwap" aria-hidden>
              <svg
                className="identityIcon identityIcon--info"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 11.5V16.5" />
                <path d="M12 7.51L12.01 7.49889" />
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
              </svg>
              <svg
                className="identityIcon identityIcon--close"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M9.17218 14.8284L12.0006 12M14.829 9.17157L12.0006 12M12.0006 12L9.17218 9.17157M12.0006 12L14.829 14.8284" />
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
              </svg>
            </span>
          </button>
        </div>
        <div className="topRight">
          <span className="projectTitle" aria-hidden={isInfoOpen || isAboutOpen}>
            {project.label}
          </span>
        </div>
      </header>

      {isAboutOpen ? (
        <aside id="about-overlay" className="aboutOverlay aboutOverlay--open" aria-hidden={false} onClick={closeAbout}>
          <div className="aboutOverlayGrid" ref={aboutOverlayGridRef}>
            <div className="aboutOverlayMarkSlot">
              <h1 className="aboutOverlayMark">fuksfranek</h1>
            </div>
            <div className="aboutOverlayBottom">
              <div className="aboutOverlayMeta">
                <p className="aboutOverlayPlace">{warsawAboutMeta.place}</p>
                <p className="aboutOverlayClock" aria-live="polite">
                  {warsawAboutMeta.clock}
                </p>
              </div>
              <div className="aboutOverlayInner">
                <div className="aboutOverlayCopy" data-about-reveal="block">
                  <p className="aboutOverlayLead">
                    I&apos;m Franek, a 21yo designer working at the intersection of brand, digital and traditional
                    graphic design. Currently designing and building websites for US-based startups at Tonik. Open for
                    freelance, available from September —{' '}
                    <a href="mailto:franek.fuks@gmail.com">franek.fuks@gmail.com</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      ) : null}

      <footer
        className="railWrap"
        ref={railWrapRef}
        data-info-open={isInfoOpen}
        data-dragging={isRailDragging}
      >
        <div className="railWrapSlide" data-hidden={!isInfoOpen}>
            <p className={`railHint ${!isInfoOpen ? 'railHint--visible' : ''}`} aria-hidden={isInfoOpen}>
              <span className="railHintChevron" aria-hidden>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M6 15L12 9L18 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="railHintLabel">swipe up for more</span>
            </p>
            <div
              className="rail"
              ref={railRef}
              data-stagger-ready={railStagger.ready}
              onPointerDown={handleRailPointerDown}
              onPointerMove={handleRailPointerMove}
              onPointerUp={handleRailPointerUp}
              onPointerCancel={handleRailPointerCancel}
              onPointerLeave={handleRailPointerLeave}
            >
              <div className="railTrack" ref={railTrackRef}>
                <div
                  ref={railFloatingDotRef}
                  className="railFloatingDot"
                  aria-hidden
                  style={
                    railDotAnimating
                      ? undefined
                      : { transform: `translate3d(${railDotTranslate.x}px, ${railDotTranslate.y}px, 0)` }
                  }
                />
                <div className="railTrackList" role="list">
            {projects.map((p, i) => {
              const open = i === projectIndex
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  ref={(node) => {
                    cardRefs.current[i] = node
                  }}
                  className={`card ${open ? 'card--open' : 'card--default'}`}
                  data-rail-enter={
                    railStagger.ready ? (railStagger.visible[i] ? 'on' : 'off') : undefined
                  }
                  style={
                    {
                      '--card-stagger': railStagger.ready ? railStagger.stagger[i] ?? 0 : 0,
                      '--card-rest-scale': 0.95,
                    } as React.CSSProperties
                  }
                  data-state={open ? 'open' : 'default'}
                  onClick={() => {
                    if (Date.now() - lastRailDragAt.current < DRAG_CLICK_SUPPRESS_MS) return
                    selectProject(i)
                  }}
                  aria-current={open ? 'true' : undefined}
                  aria-label={`${p.label}${open ? ', current project' : ''}`}
                >
                  <Squircle
                    cornerRadius={PROJECT_MEDIA_RADIUS}
                    cornerSmoothing={1}
                    className="thumb"
                  >
                    <MediaView media={p.cover} fit="cover" className="thumbMedia" variant="thumb" />
                    <SquircleMediaStroke cornerRadius={PROJECT_MEDIA_RADIUS} cornerSmoothing={1} />
                  </Squircle>
                  <div className="cardTitleFrame">
                    <span className="cardLabelRow">
                      <span className="cardLabelDotSlot" aria-hidden>
                        <span
                          className="railDotAnchor"
                          ref={(el) => {
                            railDotAnchorRefs.current[i] = el
                          }}
                        />
                      </span>
                      <span className="cardLabel">{p.label}</span>
                    </span>
                  </div>
                </button>
              )
            })}
            <ArchiveTeaser onNavigate={transitionToArchive} />
                </div>
              </div>
            </div>
        </div>
      </footer>

      <div
        ref={cursorElRef}
        className={cursorClassName}
        data-zone={cursorUi.zone}
        data-direction={cursorUi.direction}
        aria-hidden
      >
        <span className="customCursorIcon">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12L21 12M21 12L12.5 3.5M21 12L12.5 20.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <div
        ref={aboutCloseCursorRef}
        className={`aboutCloseCursor ${isAboutOpen ? 'aboutCloseCursor--visible' : ''}`}
        aria-hidden
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M9.17218 14.8284L12.0006 12M14.829 9.17157L12.0006 12M12.0006 12L9.17218 9.17157M12.0006 12L14.829 14.8284" />
          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
        </svg>
      </div>

      {archiveOpen
        ? createPortal(
            <ArchiveOverlay
              entryRects={archiveEntryRects}
              onClosed={closeArchive}
              onShellRevealStart={startArchiveShellReveal}
            />,
            document.body,
          )
        : null}

      <p className="visuallyHidden" aria-live="polite">
        {stageLabel}
      </p>
    </div>
  )
}
