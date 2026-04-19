import gsap from 'gsap'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ArchiveItem } from '../data/archivePlaceholders'
import { archiveItems } from '../data/archivePlaceholders'
import type { ArchivePlainRect } from '../lib/archiveGeometry'
import { preloadArchiveImages } from '../lib/archivePreload'
import { initElasticGridScroll } from '../lib/elasticGridScroll'
import '../ArchivePage.css'
import '../ArchiveSheet.css'

/* Match the JS column-count switch to the @media in ArchivePage.css. */
const COLUMN_COUNT_MQ = '(min-width: 900px)'

type DistributedCell = { item: ArchiveItem; originalIndex: number }

/** Pinterest-style shortest-column packing, using known aspect ratios. */
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
    target.heightUnits += item.aspectH / item.aspectW
  })
  return buckets.map((b) => b.cells)
}

const ABOVE_FOLD_COUNT = 12
const aboveFoldSrcs = archiveItems.slice(0, ABOVE_FOLD_COUNT).map((item) => item.src)
const restSrcs = archiveItems.slice(ABOVE_FOLD_COUNT).map((item) => item.src)

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — archive sheet (experiment)
 *
 * ENTER (single clock — 600ms ease-out-expo)
 *   0ms  shell scales 1→0.94 (origin top), corners round to 14px
 *   0ms  scrim 0→1
 *   0ms  panel translateY(100%)→0
 *   ~600ms settle (curve front-loads, feels ~200ms)
 *
 * EXIT (single clock — 360ms ease-in-expo)
 *   ~25% faster than enter (animations.dev convention for snap-home)
 *
 * DRAG-TO-DISMISS
 *   pointer down on handle → 1:1 follow finger (no transition)
 *   release > 120px OR velocity > 0.5px/ms → onRequestClose
 *   release below threshold → snap back to 0 via panel's default transition
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  openMs: 600,
  closeMs: 360,
  /** Sub-threshold release snap-back — must match `.archiveSheet__panel--snapping` in ArchiveSheet.css. */
  snapBackMs: 280,
  /** Handle drag — explicit grab on a visible affordance, so a relatively low
      threshold feels right. */
  handleDismissPx: 120,
  handleDismissVelocity: 0.5,
  /** Overscroll — implicit, gesture-discovered. Much higher bar so it only fires
      on a deliberate, strong pull/scroll, not on a casual try-to-scroll-past-top. */
  overscrollDismissPx: 280,
  overscrollDismissVelocity: 1.2,
  /** Wheel "release" detection: gap of silence between trackpad events. */
  wheelEndIdleMs: 140,
  /** Filters trackpad momentum landing at scrollTop=0 — events within this window
      after we last left the top are ignored unless an overscroll is already in progress. */
  wheelMomentumGuardMs: 80,
  /** Match ArchivePage.css `.archivePage--lightboxOpen` curve so the lightbox+grid pair feels paired. */
  lightboxOpenSec: 0.32,
  lightboxOpenEase: 'expo.out',
  lightboxCloseSec: 0.24,
  lightboxCloseEase: 'power2.in',
} as const

type SheetState = 'opening' | 'open' | 'closing'

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

type ArchiveSheetProps = {
  open: boolean
  /** User wants to close (button / scrim / drag / ESC). Parent should flip `open` to false. */
  onRequestClose: () => void
  /** Close animation finished — safe to unmount and clean up. */
  onClosed: () => void
}

export function ArchiveSheet({ open, onRequestClose, onClosed }: ArchiveSheetProps) {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const columnRefs = useRef<(HTMLDivElement | null)[]>([])
  const lightboxImgRef = useRef<HTMLImageElement | null>(null)
  const lightboxAnimRef = useRef<gsap.core.Timeline | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const [state, setState] = useState<SheetState>('opening')
  const [hasScrolled, setHasScrolled] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [isSnappingBack, setIsSnappingBack] = useState(false)
  const snapBackTimerRef = useRef<number | null>(null)
  const [columnCount, setColumnCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 2
    return window.matchMedia(COLUMN_COUNT_MQ).matches ? 3 : 2
  })

  const [lightbox, setLightbox] = useState<{
    item: typeof archiveItems[number]
    cellIndex: number
    fromRect: ArchivePlainRect
    toRect: ArchivePlainRect
  } | null>(null)
  const [lightboxClosing, setLightboxClosing] = useState(false)

  const dragRef = useRef({
    active: false,
    pointerId: -1,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
  })

  /* Reset the per-column ref bucket when layout reshapes. */
  const columns = useMemo(() => {
    columnRefs.current = new Array(columnCount).fill(null)
    return distributeIntoColumns(archiveItems, columnCount)
  }, [columnCount])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(COLUMN_COUNT_MQ)
    const apply = () => setColumnCount(mq.matches ? 3 : 2)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  /* Warm cache for keyboard / direct-URL opens that bypass teaser hover. */
  useEffect(() => {
    preloadArchiveImages(aboveFoldSrcs, 'high')
    preloadArchiveImages(restSrcs, 'low')
  }, [])

  /* ───── Mount + open ─────
     showModal() gives us focus trap, ESC, and ::backdrop — but we paint our own scrim
     and intercept the `cancel` event so we can run the exit animation instead of an instant close. */
  useLayoutEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    if (!dlg.open) {
      dlg.showModal()
    }
    /* Two-frame swap: mount with state='opening' (CSS keeps panel translated 100%), then flip to 'open' so the transition has two distinct states to interpolate between. */
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setState('open'))
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [])

  /* ───── React to parent flipping `open` ─────
     - open=true after a close already started → cancel the timer, revert to 'open'
     - open=false from 'open' → start exit animation, schedule onClosed */
  useEffect(() => {
    if (open) {
      if (state === 'closing') {
        if (closeTimerRef.current != null) {
          window.clearTimeout(closeTimerRef.current)
          closeTimerRef.current = null
        }
        setState('open')
      }
      return
    }
    if (state === 'closing') return

    if (reducedMotion) {
      onClosed()
      return
    }

    setState('closing')
    closeTimerRef.current = window.setTimeout(() => {
      const dlg = dialogRef.current
      if (dlg?.open) dlg.close()
      onClosed()
    }, TIMING.closeMs)
  }, [open, state, reducedMotion, onClosed])

  useEffect(
    () => () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      if (snapBackTimerRef.current != null) {
        window.clearTimeout(snapBackTimerRef.current)
        snapBackTimerRef.current = null
      }
      lightboxAnimRef.current?.kill()
      lightboxAnimRef.current = null
    },
    [],
  )

  /* Shared release handler — used by both handle-drag and overscroll-from-top.
     Each caller passes its own (distance, velocity) thresholds so the implicit
     overscroll path can be much stickier than the explicit handle grab.
     Past threshold → dismiss; otherwise snap back with a punchy 280ms transition
     (the snapping class temporarily overrides the panel's default open-clock
     transition). */
  const releaseDrag = useCallback(
    (
      offset: number,
      velocity: number,
      thresholdPx: number,
      thresholdVelocity: number,
    ) => {
      const dismiss = offset > thresholdPx || velocity > thresholdVelocity
      if (dismiss) {
        /* setDragOffset(0) here mirrors the existing handle-drag behavior — the
           subsequent state='closing' transition takes over within a frame. */
        setDragOffset(0)
        onRequestClose()
        return
      }
      setIsSnappingBack(true)
      setDragOffset(0)
      if (snapBackTimerRef.current != null) {
        window.clearTimeout(snapBackTimerRef.current)
      }
      snapBackTimerRef.current = window.setTimeout(() => {
        snapBackTimerRef.current = null
        setIsSnappingBack(false)
      }, TIMING.snapBackMs)
    },
    [onRequestClose],
  )

  /* ESC: dialog fires `cancel` — preventDefault so it doesn't slam shut, then ask parent to close (lets us run the exit animation). */
  useEffect(() => {
    const dlg = dialogRef.current
    if (!dlg) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onRequestClose()
    }
    dlg.addEventListener('cancel', onCancel)
    return () => dlg.removeEventListener('cancel', onCancel)
  }, [onRequestClose])

  /* ───── Elastic per-column lag (Codrops-style) ─────
     Skipped under reduced motion. Re-init when column count changes so lag profile matches the new layout. */
  useEffect(() => {
    if (reducedMotion) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const cols = columnRefs.current.filter((c): c is HTMLDivElement => c !== null)
    if (cols.length === 0) return
    const handle = initElasticGridScroll(scrollEl, cols)
    return () => handle.destroy()
  }, [columnCount, reducedMotion])

  /* ───── Scroll-aware handle ─────
     Once content has scrolled, the handle yields touch to native scroll. */
  const onContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const next = e.currentTarget.scrollTop > 0
    setHasScrolled((prev) => (prev === next ? prev : next))
  }, [])

  /* ───── Drag-to-dismiss ───── */
  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (hasScrolled) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      dragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startY: e.clientY,
        lastY: e.clientY,
        lastTime: performance.now(),
        velocity: 0,
      }
    },
    [hasScrolled],
  )

  const onHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.active || d.pointerId !== e.pointerId) return
    const now = performance.now()
    const dt = now - d.lastTime
    if (dt > 0) {
      /* EMA-light: instantaneous velocity is plenty for a single-axis drag release. */
      d.velocity = (e.clientY - d.lastY) / dt
    }
    d.lastY = e.clientY
    d.lastTime = now
    const next = Math.max(0, e.clientY - d.startY)
    setDragOffset(next)
  }, [])

  const onHandlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d.active || d.pointerId !== e.pointerId) return
      const target = e.currentTarget
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId)
      }
      const released = dragOffset
      const velocity = d.velocity
      d.active = false
      d.pointerId = -1
      d.velocity = 0
      releaseDrag(
        released,
        velocity,
        TIMING.handleDismissPx,
        TIMING.handleDismissVelocity,
      )
    },
    [dragOffset, releaseDrag],
  )

  /* ───── Overscroll-to-dismiss ─────
     When the user is at scrollTop=0 and pulls down (touch) or wheel-scrolls up,
     the panel follows the gesture 1:1. Past distance/velocity threshold the
     drawer dismisses; otherwise it snaps home via .archiveSheet__panel--snapping.
     Skipped under reduced motion. */
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl || reducedMotion) return

    const s = {
      touchActive: false,
      anchorY: 0,
      lastY: 0,
      lastTime: 0,
      velocity: 0,
      currentOffset: 0,
      wheelOffset: 0,
      wheelEndTimer: 0,
      /** When we last observed scrollTop > 0. Used to filter trackpad momentum
          that "lands" at scrollTop=0 from triggering an unintended overscroll. */
      leftTopTime: 0,
    }

    const flushWheel = () => {
      if (s.wheelEndTimer) {
        window.clearTimeout(s.wheelEndTimer)
        s.wheelEndTimer = 0
      }
      if (s.wheelOffset > 0) {
        const off = s.wheelOffset
        s.wheelOffset = 0
        releaseDrag(
          off,
          0,
          TIMING.overscrollDismissPx,
          TIMING.overscrollDismissVelocity,
        )
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      s.touchActive = false
      s.anchorY = t.clientY
      s.lastY = t.clientY
      s.lastTime = performance.now()
      s.velocity = 0
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      const dy = t.clientY - s.anchorY
      if (!s.touchActive) {
        if (scrollEl.scrollTop <= 0 && dy > 0) {
          s.touchActive = true
          /* Re-anchor so motion is 1:1 from the moment we engage (no jump). */
          s.anchorY = t.clientY
          s.lastY = t.clientY
          s.lastTime = performance.now()
        } else {
          return
        }
      }
      e.preventDefault()
      const now = performance.now()
      const dt = now - s.lastTime
      if (dt > 0) s.velocity = (t.clientY - s.lastY) / dt
      s.lastY = t.clientY
      s.lastTime = now
      const offset = Math.max(0, t.clientY - s.anchorY)
      s.currentOffset = offset
      setDragOffset(offset)
    }

    const onTouchEndOrCancel = () => {
      if (!s.touchActive) return
      s.touchActive = false
      const offset = s.currentOffset
      const velocity = s.velocity
      s.currentOffset = 0
      s.velocity = 0
      releaseDrag(
        offset,
        velocity,
        TIMING.overscrollDismissPx,
        TIMING.overscrollDismissVelocity,
      )
    }

    const onWheel = (e: WheelEvent) => {
      if (scrollEl.scrollTop > 0) {
        s.leftTopTime = performance.now()
        flushWheel()
        return
      }
      if (e.deltaY >= 0) {
        flushWheel()
        return
      }
      /* Filter trackpad momentum landing at top — ignore upward wheel events
         in the first ~80ms after we last left the top, unless we're already in
         an overscroll (then it's a continuous gesture). */
      if (
        s.wheelOffset === 0 &&
        performance.now() - s.leftTopTime < TIMING.wheelMomentumGuardMs
      ) {
        return
      }
      e.preventDefault()
      s.wheelOffset = Math.max(0, s.wheelOffset - e.deltaY)
      setDragOffset(s.wheelOffset)
      if (s.wheelEndTimer) window.clearTimeout(s.wheelEndTimer)
      s.wheelEndTimer = window.setTimeout(() => {
        s.wheelEndTimer = 0
        const off = s.wheelOffset
        s.wheelOffset = 0
        releaseDrag(
          off,
          0,
          TIMING.overscrollDismissPx,
          TIMING.overscrollDismissVelocity,
        )
      }, TIMING.wheelEndIdleMs)
    }

    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollEl.addEventListener('touchend', onTouchEndOrCancel, { passive: true })
    scrollEl.addEventListener('touchcancel', onTouchEndOrCancel, { passive: true })
    scrollEl.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      scrollEl.removeEventListener('touchstart', onTouchStart)
      scrollEl.removeEventListener('touchmove', onTouchMove)
      scrollEl.removeEventListener('touchend', onTouchEndOrCancel)
      scrollEl.removeEventListener('touchcancel', onTouchEndOrCancel)
      scrollEl.removeEventListener('wheel', onWheel)
      if (s.wheelEndTimer) window.clearTimeout(s.wheelEndTimer)
    }
  }, [reducedMotion, releaseDrag])

  /* ───── Lightbox: FLIP from cell to centered frame, then scale-back on close ───── */
  const openLightbox = useCallback(
    (item: (typeof archiveItems)[number], index: number) => {
      if (lightbox) return
      const cell = cellRefs.current[index]
      if (!cell) return
      const r = cell.getBoundingClientRect()
      const fromRect: ArchivePlainRect = {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      }
      const toRect = computeLightboxRect(item.aspectW, item.aspectH)
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
    /* Re-measure cell rect — masonry could have shifted since open. */
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

  /* OPEN FLIP: lightbox just mounted; image rendered at toRect. Set FLIP-from transform, animate to identity. */
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

  /* Inline transform during drag overrides the CSS open-state transform. */
  const panelStyle = dragOffset > 0 ? { transform: `translate3d(0, ${dragOffset}px, 0)` } : undefined
  const panelClass = [
    'archiveSheet__panel',
    dragOffset > 0 ? 'archiveSheet__panel--dragging' : '',
    isSnappingBack ? 'archiveSheet__panel--snapping' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /* Lightbox opens lift the close button + push the grid back. The data attr drives the modifier rules. */
  const dataLightbox = lightbox && !lightboxClosing ? 'true' : 'false'

  return (
    <dialog
      ref={dialogRef}
      className={`archiveSheet ${lightbox && !lightboxClosing ? 'archivePage--lightboxOpen' : ''}`}
      data-state={state}
      data-lightbox={dataLightbox}
      aria-label="Archive"
    >
      <div className="archiveSheet__scrim" onClick={onRequestClose} aria-hidden="true" />
      <div className={panelClass} ref={panelRef} style={panelStyle}>
        <div
          className="archiveSheet__handleArea"
          data-scrolled={hasScrolled ? 'true' : 'false'}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerEnd}
          onPointerCancel={onHandlePointerEnd}
          aria-hidden="true"
        >
          <div className="archiveSheet__handle" />
        </div>
        <button
          type="button"
          className="archiveSheet__close"
          aria-label="Close archive"
          onClick={onRequestClose}
        >
          ×
        </button>
        <div className="archiveSheet__content">
          <div className="archiveScroll" ref={scrollRef} onScroll={onContentScroll}>
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
                      className="archiveCell"
                      aria-label={`Open archive item ${i + 1}`}
                      onClick={() => openLightbox(item, i)}
                    >
                      <div
                        className="archiveCellInner"
                        style={{ aspectRatio: `${item.aspectW} / ${item.aspectH}` }}
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
        </div>
      </div>

      {lightbox && (
        <>
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
    </dialog>
  )
}
