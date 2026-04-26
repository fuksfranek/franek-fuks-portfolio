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
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { BlossomCarousel, type BlossomCarouselHandle } from '@blossom-carousel/react'
import type { Media } from './data/projects'
import { defaultProjectDescription, projects } from './data/projects'
import { ProjectInfoBody } from './ProjectInfoBody'
import { SquircleMediaStroke } from './SquircleMediaStroke'
import gsap from 'gsap'
import { Squircle } from '@squircle-js/react'
import { ArchiveSheet } from './components/ArchiveSheet'
import { ArchiveTeaser } from './components/ArchiveTeaser'
import { easeViewInset } from './lib/easeViewInset'
import type { StageChromeTone } from './lib/stageChromeSampling'
import { relativeLuminance, sampleStageChromeTone } from './lib/stageChromeSampling'
import '@blossom-carousel/core/style.css'
import './App.css'

/** Matches `--project-media-radius` in index.css */
const PROJECT_MEDIA_RADIUS = 20
/** Matches `--duration-stage-info` — stage squircle + info layout only */
const VIEW_RESIZE_MS = 320

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

function stageMediaMode(media: Media) {
  return media.presentation?.mode === 'framed' ? 'framed' : 'fill'
}

function stageMediaFit(media: Media): 'cover' | 'contain' {
  const presentation = media.presentation
  if (presentation?.mode === 'framed') return presentation.mediaFit ?? 'contain'
  return 'cover'
}

function stageObjectPosition(media: Media) {
  return media.presentation?.objectPosition ?? 'center'
}

function backgroundUrl(src: string) {
  return `url("${src.replace(/"/g, '\\"')}")`
}

function stageLayerStyle(media: Media): React.CSSProperties | undefined {
  const presentation = media.presentation
  if (presentation?.mode !== 'framed') return undefined

  const style: React.CSSProperties & Record<string, string> = {
    '--stage-framed-padding': presentation.padding ?? 'clamp(2rem, 7vw, 6.5rem)',
    '--stage-framed-bg': '#f4f0ea',
    '--stage-framed-bg-size': 'cover',
    '--stage-framed-bg-position': 'center',
  }

  const background = presentation.background
  if (background?.kind === 'color') {
    style['--stage-framed-bg'] = background.value
  } else if (background?.kind === 'image') {
    style['--stage-framed-bg'] = backgroundUrl(background.src)
    style['--stage-framed-bg-size'] = background.fit ?? 'cover'
    style['--stage-framed-bg-position'] = background.position ?? 'center'
  }

  return style
}

function toneFromHexColor(value: string): StageChromeTone | null {
  const hex = value.trim().replace(/^#/, '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return relativeLuminance(r, g, b) >= 0.56 ? 'onLight' : 'onDark'
}

function stageToneFromPresentation(media: Media): StageChromeTone | null {
  const presentation = media.presentation
  if (presentation?.mode !== 'framed') return null
  const background = presentation.background
  if (background?.kind !== 'color') return null
  return toneFromHexColor(background.value)
}

/**
 * Some gallery WebMs ship without a duration in the EBML header, so `<video>.duration`
 * reports `Infinity` until the file is fully scanned. Serving a `blob:` URL of the
 * fully-buffered bytes makes `duration` finite on `loadedmetadata` and unblocks the
 * story-meter. Cached per src so a second visit is free.
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

/** Resolves to a stable blob URL for the video; falls back to direct src on fetch failure. */
function useResolvedVideoSrc(src: string, enabled: boolean): string | undefined {
  const [resolved, setResolved] = useState<{ src: string; url: string } | null>(() => {
    const cached = enabled ? videoBlobCache.get(src) : undefined
    return cached ? { src, url: cached } : null
  })
  useEffect(() => {
    if (!enabled) return
    const cached = videoBlobCache.get(src)
    let cancelled = false
    const load = cached ? Promise.resolve(cached) : loadVideoAsBlobUrl(src)
    load
      .then((url) => {
        if (!cancelled) setResolved({ src, url })
      })
      .catch(() => {
        if (!cancelled) setResolved({ src, url: src })
      })
    return () => {
      cancelled = true
    }
  }, [src, enabled])
  return enabled && resolved?.src === src ? resolved.url : undefined
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
  /* Hook must run unconditionally; result is only consumed for full-variant videos. */
  const isFullVideo = media.kind === 'video' && variant === 'full'
  const blobSrc = useResolvedVideoSrc(media.kind === 'video' ? media.src : '', isFullVideo)

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
    /* Prefer the blob URL (finite duration). While it loads, src is undefined and the poster shows. */
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
 * GALLERY STAGE — persistent dual-buffer crossfade
 *
 * Two slots (A/B) are always mounted. The "front" slot is opaque + on top;
 * the "back" slot is invisible (opacity: 0) but in the DOM, so we can write
 * the next asset's src into it and let the browser load + decode + lay it
 * out invisibly. Once the back slot is fully ready (Image.decode() for
 * stills, `loadeddata` for videos), we swap which slot is front; CSS
 * crossfades both opacities in lockstep over GALLERY_FADE_MS.
 *
 * Because the IMG/VIDEO elements never unmount, there is no fresh-element
 * paint gap between the asset being chosen and the new pixels being on
 * screen — the user never sees the squircle background through a
 * transparent layer.
 *
 * Crossfade duration lives in App.css on `.galleryStageLayer` (currently
 * 320ms ease-out); JS doesn't need to know it because both slots transition
 * via CSS in lockstep.
 * ───────────────────────────────────────────────────────── */

function mediaIdentity(media: Media): string {
  const presentation = media.presentation ? JSON.stringify(media.presentation) : ''
  return media.kind === 'video' ? `v:${media.src}:${presentation}` : `i:${media.src}:${presentation}`
}

type SlotId = 'A' | 'B'

const GalleryStageSlot = forwardRef<
  HTMLImageElement | HTMLVideoElement | null,
  {
    media: Media | null
    loop: boolean
    isFront: boolean
    onReady: () => void
  }
>(function GalleryStageSlot({ media, loop, isFront, onReady }, ref) {
  /* Hook order is stable; arg is the empty string when not a video, which the
     hook treats as "disabled" via the `enabled` flag. */
  const isVideo = media?.kind === 'video'
  const blobSrc = useResolvedVideoSrc(
    isVideo ? (media as Extract<Media, { kind: 'video' }>).src : '',
    Boolean(isVideo),
  )

  const elRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const setRefs = useCallback(
    (node: HTMLImageElement | HTMLVideoElement | null) => {
      elRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) (ref as React.MutableRefObject<typeof node>).current = node
    },
    [ref],
  )

  /* Front video plays from the start; back video pauses to spare CPU/bandwidth. */
  useEffect(() => {
    const el = elRef.current
    if (!(el instanceof HTMLVideoElement)) return
    if (isFront) {
      try {
        el.currentTime = 0
      } catch {
        /* readyState too low; will start at 0 anyway when metadata loads */
      }
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [isFront, media])

  if (!media) return null

  const mode = stageMediaMode(media)
  const fit = stageMediaFit(media)
  const objectPosition = stageObjectPosition(media)
  const shadow = media.presentation?.mode === 'framed' ? (media.presentation.shadow ?? 'soft') : 'none'
  const className = [
    'galleryStageLayer',
    `galleryStageLayer--${isFront ? 'front' : 'back'}`,
    `galleryStageLayer--${mode}`,
    shadow === 'soft' ? 'galleryStageLayer--shadowSoft' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const mediaClassName = `galleryStageMedia galleryStageMedia--${mode}`
  const layerStyle = stageLayerStyle(media)

  const mediaStyle = { objectFit: fit, objectPosition }

  if (media.kind === 'video') {
    return (
      <div className={className} style={layerStyle}>
        {mode === 'framed' ? <span className="galleryStageLayerBackground" aria-hidden /> : null}
        {mode === 'framed' ? (
          <span className="galleryStageFrameShell">
            <Squircle
              cornerRadius={PROJECT_MEDIA_RADIUS}
              cornerSmoothing={1}
              className="galleryStageFrame"
            >
              <video
                ref={setRefs as Ref<HTMLVideoElement>}
                className={mediaClassName}
                src={blobSrc}
                poster={media.poster}
                muted
                playsInline
                loop={loop}
                autoPlay={isFront}
                preload="auto"
                controls={false}
                style={mediaStyle}
                onLoadedData={onReady}
              />
              <SquircleMediaStroke cornerRadius={PROJECT_MEDIA_RADIUS} cornerSmoothing={1} />
            </Squircle>
          </span>
        ) : (
          <video
            ref={setRefs as Ref<HTMLVideoElement>}
            className={mediaClassName}
            src={blobSrc}
            poster={media.poster}
            muted
            playsInline
            loop={loop}
            autoPlay={isFront}
            preload="auto"
            controls={false}
            style={mediaStyle}
            onLoadedData={onReady}
          />
        )}
      </div>
    )
  }

  return (
    <div className={className} style={layerStyle}>
      {mode === 'framed' ? <span className="galleryStageLayerBackground" aria-hidden /> : null}
      {mode === 'framed' ? (
        <span className="galleryStageFrameShell">
          <Squircle
            cornerRadius={PROJECT_MEDIA_RADIUS}
            cornerSmoothing={1}
            className="galleryStageFrame"
          >
            <img
              ref={setRefs as Ref<HTMLImageElement>}
              className={mediaClassName}
              src={media.src}
              alt={media.alt}
              draggable={false}
              decoding="async"
              style={mediaStyle}
              onLoad={onReady}
            />
            <SquircleMediaStroke cornerRadius={PROJECT_MEDIA_RADIUS} cornerSmoothing={1} />
          </Squircle>
        </span>
      ) : (
        <img
          ref={setRefs as Ref<HTMLImageElement>}
          className={mediaClassName}
          src={media.src}
          alt={media.alt}
          draggable={false}
          decoding="async"
          style={mediaStyle}
          onLoad={onReady}
        />
      )}
    </div>
  )
})

const GalleryStage = function GalleryStage({
  media,
  loop = true,
  onActiveElement,
  onMediaDecoded,
}: {
  media: Media
  loop?: boolean
  onActiveElement?: (el: HTMLImageElement | HTMLVideoElement | null) => void
  onMediaDecoded?: () => void
}) {
  const [slotA, setSlotA] = useState<Media | null>(media)
  const [slotB, setSlotB] = useState<Media | null>(null)
  const [front, setFront] = useState<SlotId>('A')

  const slotAElRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const slotBElRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const reqIdRef = useRef(0)
  const promotedReqIdRef = useRef(0)

  /* Notify parent whenever the front element changes. Parent uses this to
     re-run video-meter / chrome-sampling against the actually-on-screen
     element. The parent guards against no-op updates so re-fires from other
     state changes are cheap. */
  useLayoutEffect(() => {
    const node = front === 'A' ? slotAElRef.current : slotBElRef.current
    onActiveElement?.(node)
  }, [front, slotA, slotB, onActiveElement])

  useEffect(() => {
    const currentMedia = front === 'A' ? slotA : slotB
    if (currentMedia && mediaIdentity(currentMedia) === mediaIdentity(media)) return

    /* If we've already queued this exact media into the back slot, the
       pending decode/load callback will promote it — don't restart the load. */
    const targetMedia = front === 'A' ? slotB : slotA
    if (targetMedia && mediaIdentity(targetMedia) === mediaIdentity(media)) return

    const reqId = ++reqIdRef.current
    const target: SlotId = front === 'A' ? 'B' : 'A'
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (target === 'A') setSlotA(media)
      else setSlotB(media)
    })

    /* Videos promote when the slot's <video> fires `loadeddata`
       (handleSlotReady). Stills are pre-decoded off-DOM so the in-DOM
       element paints immediately when its opacity rises. */
    if (media.kind !== 'image') {
      return () => {
        cancelled = true
      }
    }

    const promote = () => {
      if (cancelled || reqId !== reqIdRef.current) return
      if (promotedReqIdRef.current >= reqId) return
      promotedReqIdRef.current = reqId
      setFront(target)
      onMediaDecoded?.()
    }

    const probe = new Image()
    probe.src = media.src
    if (typeof probe.decode === 'function') {
      probe.decode().then(promote, promote)
    } else if (probe.complete) {
      promote()
    } else {
      probe.onload = promote
      probe.onerror = promote
    }

    return () => {
      cancelled = true
    }
  }, [media, front, slotA, slotB, onMediaDecoded])

  const handleSlotReady = useCallback(
    (slotId: SlotId) => {
      const slotMedia = slotId === 'A' ? slotA : slotB
      if (!slotMedia || mediaIdentity(slotMedia) !== mediaIdentity(media)) return
      /* Initial mount path (already front): just signal the parent so the
         first chrome sample / autoplay can fire. */
      if (front === slotId) {
        onMediaDecoded?.()
        return
      }
      const reqId = reqIdRef.current
      if (promotedReqIdRef.current >= reqId) return
      promotedReqIdRef.current = reqId
      setFront(slotId)
      onMediaDecoded?.()
    },
    [front, slotA, slotB, media, onMediaDecoded],
  )

  return (
    <div className="galleryStage">
      <GalleryStageSlot
        ref={slotAElRef}
        media={slotA}
        loop={loop}
        isFront={front === 'A'}
        onReady={() => handleSlotReady('A')}
      />
      <GalleryStageSlot
        ref={slotBElRef}
        media={slotB}
        loop={loop}
        isFront={front === 'B'}
        onReady={() => handleSlotReady('B')}
      />
    </div>
  )
}

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
const RAIL_RUBBER_MAX_PX = 88
const RAIL_RUBBER_PULL_MULTIPLIER = 2.8
const RAIL_RUBBER_RELEASE_MS = 680
const STORY_DURATION_MS = 4200
const CURSOR_IDLE_MS = 1300
const CURSOR_HIDE_DISTANCE = 68

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — shell / portfolio view (ease-out layout; no rubber preview)
 *
 *      0ms   stage shows project asset; story meter cycles ~STORY_DURATION_MS
 *    220ms   info panel blocks + about lead ease in (GSAP)
 *    320ms   squircle radius + info layout settle together (VIEW_RESIZE_MS)
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

export default function PortfolioApp() {
  const [{ projectIndex, assetIndex }, dispatch] = useReducer(viewReducer, {
    projectIndex: 0,
    assetIndex: 0,
  })
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
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
  const stageWrapRef = useRef<HTMLElement>(null)
  /** Mirrors `GalleryStage`'s currently-on-screen element. Updated via the
      `onActiveElement` callback whenever the front slot promotes; the bumped
      `stageMediaTick` re-runs effects that need to attach listeners or rAF
      callbacks against the new element (chrome sampling, video story meter). */
  const stageMediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const [stageMediaTick, setStageMediaTick] = useState(0)
  /** Active story-meter fill — written via DOM when the asset is a video (synced to currentTime/duration). */
  const storyFillRef = useRef<HTMLSpanElement | null>(null)
  const [stageChromeTone, setStageChromeTone] = useState<StageChromeTone>('onDark')
  const stageHitRef = useRef<HTMLDivElement>(null)
  const projectInfoPanelRef = useRef<HTMLElement | null>(null)
  const railWrapRef = useRef<HTMLElement>(null)
  const railCarouselRef = useRef<BlossomCarouselHandle>(null)
  const aboutCloseCursorRef = useRef<HTMLDivElement | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const stageCornerRadiusRef = useRef(0)
  const stageCornerRafRef = useRef<number | null>(null)
  const [stageCornerRadius, setStageCornerRadius] = useState(0)
  const [archiveSheetMounted, setArchiveSheetMounted] = useState(false)
  const [shellSheetState, setShellSheetState] = useState<'idle' | 'pushed' | 'recovering'>('idle')

  const navigate = useNavigate()
  const location = useLocation()
  const archiveOpen = location.hash === '#archive'

  const transitionToArchive = useCallback(() => {
    navigate({ pathname: '/', hash: 'archive' }, { replace: false })
  }, [navigate])

  /* ───── Sheet lifecycle ─────
     Open: mount sheet + push shell back in the same frame (paired).
     Close: shell starts recovering immediately as sheet starts sliding down. */
  useEffect(() => {
    let cancelled = false
    const apply = () => {
      if (cancelled) return
      if (archiveOpen) {
        setArchiveSheetMounted(true)
        setShellSheetState('pushed')
      } else if (shellSheetState === 'pushed') {
        setShellSheetState('recovering')
      }
    }
    queueMicrotask(apply)
    return () => {
      cancelled = true
    }
  }, [archiveOpen, shellSheetState])

  useEffect(() => {
    if (archiveOpen) {
      return
    }
    document.documentElement.classList.remove('sheet-peeking', 'sheet-snapping')
    document.documentElement.style.removeProperty('--sheet-drag-progress')
  }, [archiveOpen])

  const handleSheetRequestClose = useCallback(() => {
    /* Flip shell into recovery in the SAME React batch as navigate. The
       lifecycle useEffect would do this one render later (after archiveOpen
       propagates), and on the gesture-close path that one-render lag is the
       difference between the shell starting its close transition with the
       panel vs. crawling back to its pushback resting pose first. */
    setShellSheetState((prev) => (prev === 'pushed' ? 'recovering' : prev))
    navigate({ pathname: '/', hash: '' }, { replace: true })
  }, [navigate])

  const handleSheetClosed = useCallback(() => {
    setArchiveSheetMounted(false)
    setShellSheetState('idle')
  }, [])

  const project = projects[projectIndex]
  const gallery = project.gallery
  const asset = gallery[assetIndex] ?? gallery[0]
  const canStep = gallery.length > 1

  const runChromeSample = useCallback(() => {
    const presentationTone = stageToneFromPresentation(asset)
    if (presentationTone) {
      setStageChromeTone((prev) => (prev === presentationTone ? prev : presentationTone))
      return
    }
    const el = stageMediaRef.current
    if (!el) return
    const next = sampleStageChromeTone(el)
    if (next) {
      setStageChromeTone((prev) => (prev === next ? prev : next))
    }
  }, [asset])

  const handleActiveStageMedia = useCallback(
    (el: HTMLImageElement | HTMLVideoElement | null) => {
      if (stageMediaRef.current === el) return
      stageMediaRef.current = el
      /* Bump tick so dependent effects re-run against the freshly-promoted element. */
      setStageMediaTick((t) => t + 1)
    },
    [],
  )

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

  const openInfo = useCallback(() => {
    infoWheelAcc.current = 0
    infoWheelAccY.current = 0
    setIsInfoOpen(true)
  }, [])

  const closeInfo = useCallback(() => {
    infoWheelAcc.current = 0
    infoWheelAccY.current = 0
    setIsInfoOpen(false)
  }, [])

  const toggleAbout = useCallback(() => {
    setIsAboutOpen((prev) => !prev)
  }, [])

  const closeAbout = useCallback(() => {
    setIsAboutOpen(false)
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
        gsap.set(blocks, { autoAlpha: 0, scale: 0.985, transformOrigin: '50% 50%' })
        gsap.to(blocks, {
          autoAlpha: 1,
          scale: 1,
          duration: TIMING.lineRevealMs / 1000,
          ease: 'power1.out',
          overwrite: 'auto',
        })
      })
    })
    return () => {
      disposed = true
      cancelAnimationFrame(rafOuter)
      cancelAnimationFrame(rafInner)
    }
  }, [isInfoOpen, project.id, project.description])

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

  useLayoutEffect(() => {
    if (!isInfoOpen) return

    const rail = railCarouselRef.current?.element
    if (!rail) return

    const railRect = rail.getBoundingClientRect()
    const railCenter = railRect.left + railRect.width / 2
    const slides = Array.from(rail.children).filter((child): child is HTMLElement =>
      child.matches('.card, .archiveTeaser'),
    )

    slides
      .map((slide, index) => {
        const rect = slide.getBoundingClientRect()
        return {
          slide,
          index,
          distance: Math.abs(rect.left + rect.width / 2 - railCenter),
        }
      })
      .sort((a, b) => a.distance - b.distance || a.index - b.index)
      .forEach(({ slide }, rank) => {
        slide.style.setProperty('--rail-enter-rank', String(rank))
      })
  }, [isInfoOpen])

  useEffect(() => {
    if (!isInfoOpen) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const rail = railCarouselRef.current?.element
    if (!rail) return

    let resetTimer = 0
    let clearTimer = 0

    const resetRubber = (clearAfterRelease = true) => {
      rail.style.setProperty('--rail-rubber-ms', `${RAIL_RUBBER_RELEASE_MS}ms`)
      rail.style.setProperty('--rail-rubber-x', '0px')
      rail.style.setProperty('--rail-edge-glow', '0')
      window.clearTimeout(clearTimer)

      if (!clearAfterRelease) {
        rail.removeAttribute('data-rubber-edge')
        return
      }

      clearTimer = window.setTimeout(() => {
        rail.removeAttribute('data-rubber-edge')
      }, RAIL_RUBBER_RELEASE_MS)
    }

    const handleOverscroll = (event: Event) => {
      const pull = (event as CustomEvent<{ left?: number }>).detail?.left ?? 0
      if (pull === 0) {
        resetRubber()
        return
      }

      const rubberX =
        Math.sign(pull) * Math.min(RAIL_RUBBER_MAX_PX, Math.abs(pull) * RAIL_RUBBER_PULL_MULTIPLIER)
      const intensity = Math.min(1, Math.abs(rubberX) / RAIL_RUBBER_MAX_PX)

      rail.dataset.rubberEdge = pull < 0 ? 'end' : 'start'
      rail.style.setProperty('--rail-rubber-ms', '0ms')
      rail.style.setProperty('--rail-rubber-x', `${rubberX.toFixed(2)}px`)
      rail.style.setProperty('--rail-edge-glow', intensity.toFixed(3))

      window.clearTimeout(resetTimer)
      window.clearTimeout(clearTimer)
      resetTimer = window.setTimeout(resetRubber, 110)
    }

    rail.addEventListener('overscroll', handleOverscroll)

    return () => {
      rail.removeEventListener('overscroll', handleOverscroll)
      window.clearTimeout(resetTimer)
      window.clearTimeout(clearTimer)
      resetRubber(false)
    }
  }, [isInfoOpen])

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
  }, [
    archiveOpen,
    closeInfo,
    isAboutOpen,
    isInfoOpen,
    openInfo,
  ])

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
    let raf = 0
    raf = requestAnimationFrame(() => {
      runChromeSample()
    })
    return () => cancelAnimationFrame(raf)
  }, [asset, isInfoOpen, projectIndex, assetIndex, runChromeSample])

  useEffect(() => {
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
  }, [asset, runChromeSample, stageMediaTick])

  /* Preload the whole gallery so step-through swaps are seamless: decoded
     bytes for stills, blob-URL'd buffers for videos (so duration is finite
     and playback starts immediately when reached). */
  useEffect(() => {
    for (const entry of gallery) {
      if (entry.kind === 'image') {
        const image = new Image()
        image.decoding = 'async'
        image.src = entry.src
      } else {
        void loadVideoAsBlobUrl(entry.src).catch(() => {})
      }
    }
  }, [gallery])

  useEffect(() => {
    if (!canStep) return

    /* Image: constant story duration (CSS keyframes drive the fill). */
    if (asset.kind !== 'video') {
      const timer = window.setTimeout(() => goNext(), STORY_DURATION_MS)
      return () => window.clearTimeout(timer)
    }

    /* Video: pill duration matches the video's actual length. The slot
       resolves to a blob URL so `duration` is finite even for headerless
       WebMs; we drive the fill scaleX from `currentTime/duration` per frame
       and advance on `ended`. */
    const v = stageMediaRef.current
    if (!(v instanceof HTMLVideoElement)) {
      /* Element not yet promoted (still loading the blob). When the front
         slot does promote, `stageMediaTick` bumps and this effect re-runs. */
      return
    }

    let cancelled = false
    let raf = 0
    let safetyTimer = 0

    const writeFill = (p: number) => {
      const node = storyFillRef.current
      if (!node) return
      const clamped = p < 0 ? 0 : p > 1 ? 1 : p
      node.style.transform = `scaleX(${clamped})`
    }

    const tick = () => {
      if (cancelled) return
      const d = v.duration
      if (Number.isFinite(d) && d > 0) {
        writeFill(v.currentTime / d)
      }
      raf = requestAnimationFrame(tick)
    }

    const onEnded = () => {
      writeFill(1)
      goNext()
    }
    v.addEventListener('ended', onEnded)

    /* Safety net: if the file is broken or stalls before metadata loads,
       advance on a generous fallback so the carousel can't soft-lock. */
    safetyTimer = window.setTimeout(() => {
      if (!cancelled) goNext()
    }, 30_000)

    writeFill(0)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.clearTimeout(safetyTimer)
      v.removeEventListener('ended', onEnded)
    }
  }, [asset, assetIndex, canStep, goNext, projectIndex, stageMediaTick])

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

  const sheetShellClass =
    shellSheetState === 'pushed'
      ? 'shell--pushed-by-sheet'
      : shellSheetState === 'recovering'
        ? 'shell--pushed-by-sheet shell--sheet-recovering'
        : ''

  return (
    <div
      ref={shellRef}
      className={`shell ${isInfoOpen ? 'shell--info' : ''} ${isAboutOpen ? 'shell--about' : ''} ${
        stageChromeTone === 'onLight' ? 'shell--chrome-on-light' : 'shell--chrome-on-dark'
      } ${sheetShellClass}`}
      aria-hidden={archiveOpen}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="fullBleed">
        <div className="fullBleedInner">
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
                    media={asset}
                    loop={!canStep}
                    onActiveElement={handleActiveStageMedia}
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
        <div className="topRight">
          <span className="projectTitle" aria-hidden={isInfoOpen || isAboutOpen}>
            {project.label}
          </span>
        </div>
        <div className="topBarLead">
          <p className="identity" aria-hidden={isAboutOpen}>
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
      </header>

      <aside
        id="about-overlay"
        className={`aboutOverlay ${isAboutOpen ? 'aboutOverlay--open' : ''}`}
        aria-hidden={!isAboutOpen}
        onClick={isAboutOpen ? closeAbout : undefined}
      >
        <div className="aboutOverlayContent">
          <p className="aboutOverlayText">
            I&apos;m Franek, a 21yo designer working at the intersection of brand, digital and traditional
            graphic design. Currently designing and building websites for US-based startups at Tonik. Open for
            freelance, available from September —{' '}
            <a href="mailto:franek.fuks@gmail.com">franek.fuks@gmail.com</a>
          </p>
        </div>
      </aside>

      <footer
        className="railWrap"
        ref={railWrapRef}
        data-info-open={isInfoOpen}
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
          <BlossomCarousel ref={railCarouselRef} as="div" className="rail" role="list" load="always">
            {projects.map((p, i) => {
              const open = i === projectIndex
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  className={`card ${open ? 'card--open' : 'card--default'}`}
                  style={
                    {
                      '--rail-enter-index': i,
                      '--card-rest-scale': 0.95,
                    } as React.CSSProperties
                  }
                  data-state={open ? 'open' : 'default'}
                  onClick={() => selectProject(i)}
                  aria-current={open ? 'true' : undefined}
                  aria-label={`${p.label}, ${p.category}${open ? ', current project' : ''}`}
                >
                  <Squircle
                    cornerRadius={PROJECT_MEDIA_RADIUS}
                    cornerSmoothing={1}
                    className="thumb"
                  >
                    <MediaView media={p.cover} fit="cover" className="thumbMedia" variant="thumb" />
                    <SquircleMediaStroke cornerRadius={PROJECT_MEDIA_RADIUS} cornerSmoothing={1} />
                    <span className="cardSelectedIcon" aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 13C6.6 5 17.4 5 21 13"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 17C10.3431 17 9 15.6569 9 14C9 12.3431 10.3431 11 12 11C13.6569 11 15 12.3431 15 14C15 15.6569 13.6569 17 12 17Z"
                          fill="currentColor"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="cardSelectedText">viewing now</span>
                    </span>
                    <span className="cardHoverIcon" aria-hidden>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M17 8L12 3L7 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M17 16L12 21L7 16"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="cardLabel">
                      <span className="cardLabelTitle">{p.label}</span>
                      <span className="cardLabelCategory">{p.category}</span>
                    </span>
                  </Squircle>
                </button>
              )
            })}
            <ArchiveTeaser
              onNavigate={transitionToArchive}
              style={{ '--rail-enter-index': projects.length } as React.CSSProperties}
            />
          </BlossomCarousel>
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

      {archiveSheetMounted
        ? createPortal(
            <ArchiveSheet
              open={archiveOpen}
              onRequestClose={handleSheetRequestClose}
              onClosed={handleSheetClosed}
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
