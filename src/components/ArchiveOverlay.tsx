import gsap from 'gsap'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ArchiveItem } from '../data/archivePlaceholders'
import { archiveItems } from '../data/archivePlaceholders'
import type { ArchivePlainRect } from '../lib/archiveGeometry'
import { stackOriginRect, teaserTargetsFromStackBounds } from '../lib/archiveGeometry'
import { preloadArchiveImages } from '../lib/archivePreload'
import { readArchiveTeaserBoundsFromSession } from '../lib/archiveTeaserBounds'
import { easeViewInset } from '../lib/easeViewInset'
import { initElasticGridScroll } from '../lib/elasticGridScroll'
import '../ArchivePage.css'

/* Single source of truth for the masonry breakpoint — keep CSS @media in
   ArchivePage.css and this MQ in sync. JS owns column count because each
   column needs to be a real DOM node for elastic per-column lag. */
const COLUMN_COUNT_MQ = '(min-width: 900px)'

/** Cell + its position in `archiveItems` (cellRefs is indexed by original index). */
type DistributedCell = { item: ArchiveItem; originalIndex: number }

/** Pinterest-style shortest-column packing using known aspect ratios.
 *  Cells flow in order; each one lands in the currently shortest column. */
function distributeIntoColumns(
  items: readonly ArchiveItem[],
  columnCount: number,
): DistributedCell[][] {
  type Bucket = { cells: DistributedCell[]; heightUnits: number }
  const buckets: Bucket[] = Array.from({ length: columnCount }, () => ({
    cells: [],
    heightUnits: 0,
  }))
  items.forEach((item, originalIndex) => {
    let target = buckets[0]!
    for (let i = 1; i < buckets.length; i += 1) {
      if (buckets[i]!.heightUnits < target.heightUnits) target = buckets[i]!
    }
    target.cells.push({ item, originalIndex })
    /* Height contribution per unit of column width — drives the packing decision. */
    target.heightUnits += item.aspectH / item.aspectW
  })
  return buckets.map((b) => b.cells)
}

const TILE_COUNT = archiveItems.length
/** Cells likely visible above the fold on most viewports — get eager loading + high fetch priority. */
const ABOVE_FOLD_COUNT = 12
const aboveFoldSrcs = archiveItems.slice(0, ABOVE_FOLD_COUNT).map((item) => item.src)
const restSrcs = archiveItems.slice(ABOVE_FOLD_COUNT).map((item) => item.src)

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — archive overlay (hash #archive)
 *
 * ENTER — everything starts at frame 1, runs concurrently
 *   0ms    portfolio shell fades 1→0 (240ms ease-out-expo, App.css)
 *   0ms    overlay backdrop fades 0→1 (320ms ease-out-expo) — the "smooth black"
 *   0ms    25 FLIP clones fly stack→grid, stagger 4ms, per-clone:
 *            translate+scale enterFlightMs on easeOutExpo (spring-like snap),
 *            handoff to real cell at enterCellRevealAtFraction,
 *            clone tail-fades to 0 in enterCloneFadeOutMs.
 *   180ms  back dock fades+scales in (220ms ease-out-expo) — escape long before settle
 *   ~516ms last tile lands
 *
 * EXIT (Back — one shared clock)
 *   0ms    shell--archive-revealing → shell opacity 0→1 over exitTotalMs
 *   0ms    overlay opacity 1→0 over exitTotalMs (paired curve with shell)
 *   0ms    25 FLIP clones grid→stack, stagger 3ms, power2.in (snap home)
 *   exitTotalMs  unmount + clear hash
 * ───────────────────────────────────────────────────────── */

/** Equivalent to cubic-bezier(0.16, 1, 0.3, 1) — spring-like snap, long settle. */
function easeOutExpo(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 1 - Math.pow(2, -10 * t)
}

const TIMING = {
  enterFlightMs: 420,
  enterStaggerMs: 4,
  enterCloneFadeOutMs: 140,
  /** Hand off to the real cell at this point of each clone's flight (cell+clone overlap ≥ 1). */
  enterCellRevealAtFraction: 0.5,
  enterEase: easeOutExpo,
  /** Backdrop CSS transition (ArchivePage.css `.archiveOverlay--enterReady`). */
  enterBackdropMs: 320,
  /** Dock reveal mid-flight — gives users an escape long before all tiles land. */
  enterDockRevealAtMs: 180,
  /** Single budget for shell reveal ∥ overlay dissolve ∥ FLIP gather (snappier than enter). */
  exitTotalMs: 280,
  exitStaggerMs: 3,
  exitEase: 'power2.in',
  exitOverlayEase: easeViewInset,
  /** Lightbox open: substantial scale, ease-out-expo for spring snap. Pairs with grid pushback (CSS, same curve). */
  lightboxOpenSec: 0.32,
  lightboxOpenEase: 'expo.out',
  /** Lightbox close: ~25% faster than open, power2.in pulled-home feel. */
  lightboxCloseSec: 0.24,
  lightboxCloseEase: 'power2.in',
} as const

/** Lightbox image rect: image's natural aspect, fit within 92vw × 88vh, centered. */
function computeLightboxRect(aspectW: number, aspectH: number): ArchivePlainRect {
  const maxW = Math.min(window.innerWidth * 0.92, 1400)
  const maxH = window.innerHeight * 0.88
  const ratio = aspectW / aspectH
  let w = maxW
  let h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  return {
    left: (window.innerWidth - w) / 2,
    top: (window.innerHeight - h) / 2,
    width: w,
    height: h,
  }
}

function exitFlyDurationSec(tileCount: number): number {
  const span = TIMING.exitTotalMs / 1000
  const stagger = TIMING.exitStaggerMs / 1000
  return Math.max(0.24, span - (tileCount - 1) * stagger)
}

function isPlainRect(value: unknown): value is ArchivePlainRect {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.top === 'number' &&
    typeof o.left === 'number' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number'
  )
}

function fallbackStackBounds(): ArchivePlainRect {
  return {
    left: window.innerWidth * 0.5 - 65,
    top: window.innerHeight - 152,
    width: 130,
    height: 104,
  }
}

function resolveTeaserTriplet(entry: ArchivePlainRect[] | null | undefined): ArchivePlainRect[] {
  if (entry && entry.length === 3 && entry.every(isPlainRect)) return entry
  const bounds = readArchiveTeaserBoundsFromSession() ?? fallbackStackBounds()
  return teaserTargetsFromStackBounds(bounds)
}

/** ENTER: clone flies stack→target; calls `onHandoff` mid-flight so the real cell can crossfade in under the tail-fade. */
function flyCardEnter(
  host: HTMLElement,
  src: string,
  from: ArchivePlainRect,
  to: ArchivePlainRect,
  zIndex: number,
  onHandoff: () => void,
): gsap.core.Timeline {
  const el = document.createElement('div')
  el.className = 'archiveFlyCard archiveFlyCard--enter'
  el.style.borderRadius = '14px'
  el.style.overflow = 'hidden'
  /* Subtle ambient shadow — reads against the fading-in black backdrop without competing with the cell's landed shadow. */
  el.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.22)'
  const img = document.createElement('img')
  img.src = src
  img.alt = ''
  img.draggable = false
  img.decoding = 'async'
  img.setAttribute('fetchpriority', 'high')
  img.style.display = 'block'
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = 'cover'
  el.appendChild(img)
  host.appendChild(el)

  const flightSec = TIMING.enterFlightMs / 1000
  const fadeOutSec = TIMING.enterCloneFadeOutMs / 1000
  const handoffAtSec = (TIMING.enterFlightMs * TIMING.enterCellRevealAtFraction) / 1000
  const tailStartSec = Math.max(handoffAtSec, flightSec - fadeOutSec)

  gsap.set(el, {
    position: 'fixed',
    left: 0,
    top: 0,
    width: to.width,
    height: to.height,
    x: from.left,
    y: from.top,
    scaleX: from.width / to.width,
    scaleY: from.height / to.height,
    transformOrigin: '0 0',
    force3D: true,
    willChange: 'transform, opacity',
    zIndex,
    pointerEvents: 'none',
    opacity: 1,
  })

  const tl = gsap.timeline({
    onComplete: () => {
      el.remove()
    },
  })

  tl.to(
    el,
    {
      x: to.left,
      y: to.top,
      scaleX: 1,
      scaleY: 1,
      duration: flightSec,
      ease: TIMING.enterEase,
    },
    0,
  )

  tl.call(onHandoff, undefined, handoffAtSec)

  tl.to(
    el,
    {
      opacity: 0,
      duration: fadeOutSec,
      ease: 'power2.in',
    },
    tailStartSec,
  )

  return tl
}

/** EXIT: FLIP clone gathers from grid back to stack. */
function flyCardExit(
  host: HTMLElement,
  src: string,
  from: ArchivePlainRect,
  to: ArchivePlainRect,
  durationSec: number,
  ease: string,
  zIndex: number,
): gsap.core.Timeline {
  const el = document.createElement('div')
  el.className = 'archiveFlyCard archiveFlyCard--exit'
  el.style.borderRadius = '14px'
  el.style.overflow = 'hidden'
  el.style.boxShadow = '0 12px 28px rgba(16, 22, 31, 0.12)'
  const img = document.createElement('img')
  img.src = src
  img.alt = ''
  img.draggable = false
  img.decoding = 'async'
  img.style.display = 'block'
  img.style.width = '100%'
  img.style.height = '100%'
  img.style.objectFit = 'cover'
  el.appendChild(img)
  host.appendChild(el)

  gsap.set(el, {
    position: 'fixed',
    left: 0,
    top: 0,
    width: to.width,
    height: to.height,
    x: from.left,
    y: from.top,
    scaleX: from.width / to.width,
    scaleY: from.height / to.height,
    transformOrigin: '0 0',
    force3D: true,
    willChange: 'transform',
    zIndex,
    pointerEvents: 'none',
  })

  const tl = gsap.timeline({
    onComplete: () => {
      el.remove()
    },
  })
  tl.to(el, {
    x: to.left,
    y: to.top,
    scaleX: 1,
    scaleY: 1,
    duration: durationSec,
    ease,
  })
  return tl
}

function addEnterFlights(
  master: gsap.core.Timeline,
  host: HTMLElement,
  triplet: ArchivePlainRect[],
  targets: ArchivePlainRect[],
  cellRefs: (HTMLButtonElement | null)[],
) {
  const step = TIMING.enterStaggerMs / 1000
  archiveItems.forEach((item, i) => {
    master.add(
      flyCardEnter(host, item.src, stackOriginRect(i, triplet), targets[i]!, 200 + i, () => {
        const cell = cellRefs[i]
        if (cell) cell.classList.remove('archiveCell--flyPending')
      }),
      i * step,
    )
  })
}

function addExitFlights(
  master: gsap.core.Timeline,
  host: HTMLElement,
  triplet: ArchivePlainRect[],
  fromRects: ArchivePlainRect[],
  flyDurSec: number,
) {
  const step = TIMING.exitStaggerMs / 1000
  archiveItems.forEach((item, i) => {
    const z = 260 + (TILE_COUNT - 1 - i)
    master.add(
      flyCardExit(host, item.src, fromRects[i]!, stackOriginRect(i, triplet), flyDurSec, TIMING.exitEase, z),
      i * step,
    )
  })
}

type ArchiveOverlayProps = {
  entryRects: ArchivePlainRect[] | null
  onClosed: () => void
  /** Portfolio shell uses this duration (ms) for opacity/blur reveal, in sync with exit motion. */
  onShellRevealStart: (motionDurationMs: number) => void
}

export function ArchiveOverlay({ entryRects, onClosed, onShellRevealStart }: ArchiveOverlayProps) {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [flyPending, setFlyPending] = useState(() => !reducedMotion)
  /* Hidden until mid-flight — dock sits where the clones spawn, can't be "behind" what isn't there. */
  const [dockReady, setDockReady] = useState(() => reducedMotion)
  /* Two-frame swap: mount with `--entering` (opacity 0), flip to `--enterReady` next frame
     so the CSS transition fires from a known state. */
  const [enterReady, setEnterReady] = useState(() => reducedMotion)
  /* Lightbox FLIP state: the `from` rect (clicked cell, viewport coords) and `to` rect (computed at open) drive the scale animation.
     Stays mounted through the close anim — `closing` flag tells handlers to leave it alone while GSAP runs. */
  const [lightbox, setLightbox] = useState<{
    item: typeof archiveItems[number]
    cellIndex: number
    fromRect: ArchivePlainRect
    toRect: ArchivePlainRect
  } | null>(null)
  const [lightboxClosing, setLightboxClosing] = useState(false)
  /* Column count drives both the DOM structure (one .archiveColumn per column)
     and the elastic-grid lag profile. Synced to the same MQ as the CSS. */
  const [columnCount, setColumnCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 2
    return window.matchMedia(COLUMN_COUNT_MQ).matches ? 3 : 2
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(COLUMN_COUNT_MQ)
    const apply = () => setColumnCount(mq.matches ? 3 : 2)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const overlayRootRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const flyHostRef = useRef<HTMLDivElement | null>(null)
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  /* Indexed by column number (left → right). Reset on column-count change so
     stale refs from a wider layout don't leak into the elastic init. */
  const columnRefs = useRef<(HTMLDivElement | null)[]>([])
  const exitLockRef = useRef(false)
  const enterCtxRef = useRef<gsap.Context | null>(null)
  const exitTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const dockRevealTimerRef = useRef<number | null>(null)
  const lightboxImgRef = useRef<HTMLImageElement | null>(null)
  const lightboxAnimRef = useRef<gsap.core.Timeline | null>(null)

  /* Reset the column-ref bucket whenever the layout reshapes — React will
     repopulate via the fresh ref callbacks below. */
  const columns = useMemo(() => {
    columnRefs.current = new Array(columnCount).fill(null)
    return distributeIntoColumns(archiveItems, columnCount)
  }, [columnCount])

  const ensureFlyHost = useCallback(() => {
    if (flyHostRef.current) return flyHostRef.current
    const el = document.createElement('div')
    el.setAttribute('data-archive-fly-host', 'true')
    el.style.position = 'fixed'
    el.style.inset = '0'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '250'
    document.body.appendChild(el)
    flyHostRef.current = el
    return el
  }, [])

  const removeFlyHost = useCallback(() => {
    flyHostRef.current?.remove()
    flyHostRef.current = null
  }, [])

  /* Warm cache for keyboard / direct-URL opens that bypass teaser hover. */
  useEffect(() => {
    preloadArchiveImages(aboveFoldSrcs, 'high')
    preloadArchiveImages(restSrcs, 'low')
  }, [])

  /* ───── Elastic per-column lag (Codrops "Elastic Grid Scroll" feel) ─────
     Each .archiveColumn drifts behind the live scroll by lag×velocity, then
     eases home when scroll stops. Center column is stiff, outer columns loose
     → the wall of cards reads as a soft, elastic ripple from the edges.
     Skipped under reduced motion (no transforms applied at all). */
  useEffect(() => {
    if (reducedMotion) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const cols = columnRefs.current.filter((c): c is HTMLDivElement => c !== null)
    if (cols.length === 0) return
    const handle = initElasticGridScroll(scrollEl, cols)
    return () => handle.destroy()
  }, [columnCount, reducedMotion])

  useLayoutEffect(() => {
    if (reducedMotion) return

    /* Flip enterReady on the next frame so the CSS opacity transition has two distinct states to interpolate. */
    const raf = requestAnimationFrame(() => setEnterReady(true))

    /* Dock reveals mid-flight, not at completion — gives the user an escape early. */
    dockRevealTimerRef.current = window.setTimeout(() => {
      setDockReady(true)
    }, TIMING.enterDockRevealAtMs)

    const host = ensureFlyHost()
    enterCtxRef.current?.revert()
    enterCtxRef.current = gsap.context(() => {
      const triplet = resolveTeaserTriplet(entryRects)

      const measureTargets = (): ArchivePlainRect[] | null => {
        const out: ArchivePlainRect[] = []
        for (let i = 0; i < TILE_COUNT; i += 1) {
          const el = cellRefs.current[i]
          if (!el) return null
          const r = el.getBoundingClientRect()
          out.push({ left: r.left, top: r.top, width: r.width, height: r.height })
        }
        return out
      }

      const run = () => {
        const targets = measureTargets()
        if (!targets) {
          requestAnimationFrame(run)
          return
        }

        const master = gsap.timeline({
          onComplete: () => {
            /* Per-cell handoffs already removed --flyPending; sync React state. */
            setFlyPending(false)
            removeFlyHost()
          },
        })
        addEnterFlights(master, host, triplet, targets, cellRefs.current)
      }

      run()
    }, host)

    return () => {
      cancelAnimationFrame(raf)
      if (dockRevealTimerRef.current !== null) {
        window.clearTimeout(dockRevealTimerRef.current)
        dockRevealTimerRef.current = null
      }
      enterCtxRef.current?.revert()
      enterCtxRef.current = null
      removeFlyHost()
    }
  }, [ensureFlyHost, entryRects, reducedMotion, removeFlyHost])

  const finishClose = useCallback(() => {
    exitTimelineRef.current = null
    removeFlyHost()
    exitLockRef.current = false
    /* Do not clear GSAP opacity here: clearProps would snap overlay back to opacity 1 for a frame before unmount. */
    onClosed()
  }, [onClosed, removeFlyHost])

  const openLightbox = useCallback(
    (item: (typeof archiveItems)[number], index: number) => {
      if (lightbox) return
      const cell = cellRefs.current[index]
      if (!cell) return
      const r = cell.getBoundingClientRect()
      const fromRect: ArchivePlainRect = { left: r.left, top: r.top, width: r.width, height: r.height }
      const toRect = computeLightboxRect(item.aspectW, item.aspectH)
      /* Hide source cell so we don't see the original underneath the FLIP image during scale-up. */
      cell.style.visibility = 'hidden'
      setLightbox({ item, cellIndex: index, fromRect, toRect })
    },
    [lightbox],
  )

  const closeLightbox = useCallback(() => {
    if (!lightbox || lightboxClosing) return
    const cell = cellRefs.current[lightbox.cellIndex]
    const img = lightboxImgRef.current

    if (reducedMotion || !cell || !img) {
      if (cell) cell.style.visibility = ''
      setLightbox(null)
      return
    }

    setLightboxClosing(true)
    /* Re-measure cell rect — masonry could have shifted (resize, scrollbar quirks). */
    const r = cell.getBoundingClientRect()
    const toCell: ArchivePlainRect = { left: r.left, top: r.top, width: r.width, height: r.height }
    const lightRect = lightbox.toRect

    lightboxAnimRef.current?.kill()
    const tl = gsap.timeline({
      onComplete: () => {
        cell.style.visibility = ''
        lightboxAnimRef.current = null
        setLightboxClosing(false)
        setLightbox(null)
      },
    })
    tl.to(img, {
      x: toCell.left - lightRect.left,
      y: toCell.top - lightRect.top,
      scaleX: toCell.width / lightRect.width,
      scaleY: toCell.height / lightRect.height,
      duration: TIMING.lightboxCloseSec,
      ease: TIMING.lightboxCloseEase,
    })
    lightboxAnimRef.current = tl
  }, [lightbox, lightboxClosing, reducedMotion])

  /* OPEN: lightbox just mounted; image rendered at toRect. Set the FLIP-from transform, then animate to identity. */
  useLayoutEffect(() => {
    if (!lightbox || lightboxClosing) return
    if (reducedMotion) return
    const img = lightboxImgRef.current
    if (!img) return

    const { fromRect, toRect } = lightbox
    gsap.set(img, {
      x: fromRect.left - toRect.left,
      y: fromRect.top - toRect.top,
      scaleX: fromRect.width / toRect.width,
      scaleY: fromRect.height / toRect.height,
      transformOrigin: '0 0',
      force3D: true,
      willChange: 'transform',
    })

    lightboxAnimRef.current?.kill()
    const tl = gsap.timeline({
      onComplete: () => {
        lightboxAnimRef.current = null
      },
    })
    tl.to(img, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      duration: TIMING.lightboxOpenSec,
      ease: TIMING.lightboxOpenEase,
    })
    lightboxAnimRef.current = tl

    return () => {
      tl.kill()
    }
  }, [lightbox, lightboxClosing, reducedMotion])

  const handleBack = useCallback(() => {
    if (exitLockRef.current) return
    if (lightbox) {
      closeLightbox()
      return
    }

    if (reducedMotion) {
      finishClose()
      return
    }

    exitLockRef.current = true
    onShellRevealStart(TIMING.exitTotalMs)

    /* Drop the enter CSS transition before GSAP takes over opacity — avoids competing animators.
       DOM-only mutation: React state stays as-is since we're about to unmount. */
    const overlayEl = overlayRootRef.current
    if (overlayEl) {
      overlayEl.classList.remove('archiveOverlay--entering', 'archiveOverlay--enterReady')
      overlayEl.style.opacity = '1'
    }

    const host = ensureFlyHost()
    const exitTriplet = resolveTeaserTriplet(entryRects)
    const flyDurSec = exitFlyDurationSec(TILE_COUNT)
    const exitSpanSec = TIMING.exitTotalMs / 1000

    const fromRects: ArchivePlainRect[] = []
    for (let i = 0; i < TILE_COUNT; i += 1) {
      const el = cellRefs.current[i]
      if (!el) {
        finishClose()
        return
      }
      const r = el.getBoundingClientRect()
      fromRects.push({ left: r.left, top: r.top, width: r.width, height: r.height })
    }

    for (let i = 0; i < TILE_COUNT; i += 1) {
      const el = cellRefs.current[i]
      if (el) el.style.visibility = 'hidden'
    }

    const master = gsap.timeline({
      onComplete: finishClose,
    })
    exitTimelineRef.current = master

    if (overlayEl) {
      master.fromTo(
        overlayEl,
        { opacity: 1 },
        { opacity: 0, duration: exitSpanSec, ease: TIMING.exitOverlayEase },
        0,
      )
    }

    addExitFlights(master, host, exitTriplet, fromRects, flyDurSec)
  }, [
    closeLightbox,
    ensureFlyHost,
    entryRects,
    finishClose,
    lightbox,
    onShellRevealStart,
    reducedMotion,
  ])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleBack])

  useEffect(
    () => () => {
      exitTimelineRef.current?.kill()
      exitTimelineRef.current = null
      lightboxAnimRef.current?.kill()
      lightboxAnimRef.current = null
    },
    [],
  )

  const enterStateClass = enterReady ? 'archiveOverlay--enterReady' : 'archiveOverlay--entering'
  /* Drives CSS pushback on grid + dock; stays absent during close so the page springs back forward as the image FLIPs home. */
  const lightboxOpenClass = lightbox && !lightboxClosing ? 'archivePage--lightboxOpen' : ''

  return (
    <div
      ref={overlayRootRef}
      className={`archivePage archiveOverlay ${enterStateClass} ${lightboxOpenClass}`}
      role="dialog"
      aria-modal="true"
      aria-label="Archive"
    >
      <div className="archivePageContent">
        <div className="archiveScroll" ref={scrollRef}>
          <div className="archiveMasonry" role="list">
            {columns.map((colCells, colIdx) => (
              <div
                key={colIdx}
                className="archiveColumn"
                ref={(node) => {
                  columnRefs.current[colIdx] = node
                }}
              >
                {colCells.map(({ item, originalIndex: i }) => (
                  <button
                    key={item.id}
                    type="button"
                    role="listitem"
                    ref={(node) => {
                      cellRefs.current[i] = node
                    }}
                    className={`archiveCell ${flyPending ? 'archiveCell--flyPending' : ''}`}
                    aria-label={`Open archive item ${i + 1}`}
                    onClick={() => openLightbox(item, i)}
                  >
                    <div
                      className="archiveCellInner"
                      style={{
                        aspectRatio: `${item.aspectW} / ${item.aspectH}`,
                      }}
                    >
                      <img
                        className="archiveCellImage"
                        src={item.src}
                        alt={item.alt}
                        loading={i < ABOVE_FOLD_COUNT ? 'eager' : 'lazy'}
                        fetchPriority={i < ABOVE_FOLD_COUNT ? 'high' : 'low'}
                        decoding="async"
                        draggable={false}
                        ref={(node) => {
                          /* Cached images may already be `complete` before React attaches `onLoad` — flip ready immediately. */
                          if (node?.complete && node.naturalHeight > 0) {
                            node.classList.add('archiveCellImage--ready')
                          }
                        }}
                        onLoad={(e) => e.currentTarget.classList.add('archiveCellImage--ready')}
                      />
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="archiveBackDock">
          <button
            type="button"
            className={`archiveBack archiveBack--dock ${dockReady ? '' : 'archiveBack--dock--pending'}`}
            onClick={handleBack}
            aria-hidden={!dockReady}
            tabIndex={dockReady ? 0 : -1}
          >
            ← Back
          </button>
        </div>
      </div>

      {lightbox && (
        <>
          {/* Click-catcher behind the image. Transparent — the dim is created by fading the grid itself, not by a scrim. */}
          <div
            className="archiveLightboxScrim"
            onClick={closeLightbox}
            aria-hidden="true"
          />
          <img
            ref={lightboxImgRef}
            className="archiveLightboxImage"
            src={lightbox.item.src}
            alt={lightbox.item.alt}
            decoding="async"
            draggable={false}
            onClick={closeLightbox}
            style={{
              position: 'fixed',
              left: lightbox.toRect.left,
              top: lightbox.toRect.top,
              width: lightbox.toRect.width,
              height: lightbox.toRect.height,
            }}
          />
          <button
            type="button"
            className="archiveLightboxClose"
            aria-label="Close preview"
            onClick={closeLightbox}
          >
            ×
          </button>
        </>
      )}
    </div>
  )
}
