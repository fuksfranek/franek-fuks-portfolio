import gsap from 'gsap'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Squircle } from '@squircle-js/react'
import { SquircleMediaStroke } from '../SquircleMediaStroke'
import type { ArchiveItem } from '../data/archivePlaceholders'
import { archiveItems } from '../data/archivePlaceholders'
import type { ArchivePlainRect } from '../lib/archiveGeometry'
import { preloadArchiveImages } from '../lib/archivePreload'
import { initElasticGridScroll } from '../lib/elasticGridScroll'
import '../ArchivePage.css'
import '../ArchiveSheet.css'

/* Match the JS column-count switch to the @media in ArchivePage.css. */
const COLUMN_COUNT_MQ = '(min-width: 900px)'

/* Squircle radius for archive cells — matches the existing .archiveCell border-radius
   (kept on the outer button for hover-shadow shape); the Squircle wrapper applies
   `cornerSmoothing: 1` so the clipped image reads as a true squircle, consistent with
   the project thumbs and stage media in PortfolioApp. */
const ARCHIVE_CELL_RADIUS = 14

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
 * ANIMATION STORYBOARD — archive sheet
 *
 * ENTER (single clock — 600ms ease-out-expo)
 *   0ms   shell scales 1 → 0.94 (origin top), corners round to 14px, saturate 0.78
 *   0ms   scrim 0 → 1
 *   0ms   panel translateY(100%) → 0
 *  ~600ms settle (curve front-loads, feels ~200ms)
 *
 * EXIT (single clock — 360ms ease-in-expo)
 *   ~25% faster than enter (animations.dev convention for snap-home)
 *
 * HANDLE DRAG (explicit grab on the pill)
 *   pointer down → 1:1 follow finger (no transition)
 *   release > 120px OR velocity > 0.5px/ms → dismiss
 *   release below threshold → 280ms snap back
 *
 * GESTURE-CLOSE (touch swipe down at scrollTop=0 — touch only, no wheel)
 *   iOS-sheet feel: drawer follows the finger 1:1 with no resistance.
 *   Release decision is direct distance OR velocity:
 *     displayed > 25% drawer height  → commit
 *     OR velocity > 0.6 px/ms        → commit (fast flick on short distance)
 *     else                           → 280ms snap back
 *   Commit doesn't snap drag-offset to 0 first — it clears the inline
 *   transform + peeking class, and the dialog's data-state='closing' rule
 *   takes over, transitioning from the gesture's last rendered position to
 *   translateY(100%) over close-ms. No jump.
 *   Gesture progress (displayed / commitDistance, clamped 0..1) is published
 *   as `--sheet-drag-progress` on <html>, so .shell--pushed-by-sheet previews
 *   the close in lockstep:
 *     scale 0.94 → 0.97, translateY 8 → 0, saturate 0.78 → 1, radius 14 → 8.
 *
 * LIGHTBOX (FLIP from cell to centered frame)
 *   Open: image scales from cell rect to centered viewport rect over 320ms.
 *         Drawer panel + chrome fade out behind a near-black canvas — the
 *         lightbox treats the whole viewport as its surface, not just the drawer.
 *   Close: image FLIPs back to cell rect over 240ms; canvas + drawer fade back in.
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  openMs: 600,
  closeMs: 360,
  /** Sub-threshold release snap-back — must match `.archiveSheet__panel--snapping`
      in ArchiveSheet.css and the .sheet-snapping shell rule. */
  snapBackMs: 280,
  /** Handle drag — explicit grab on a visible affordance, low threshold feels right. */
  handleDismissPx: 120,
  handleDismissVelocity: 0.5,
  /** Gesture-close (touch swipe down at scrollTop=0). Touch only — no wheel
      hijacking on desktop, where scroll-to-close was unintuitive. */
  overscroll: {
    /** Visible distance to commit dismiss as a fraction of the panel's height. */
    dismissDistanceFrac: 0.25,
    /** Velocity (px/ms) override — fast flick commits even on short distance. */
    dismissVelocity: 0.6,
    /** Floor / ceiling for the gesture-close duration (ms). The actual duration
        is computed from remaining distance + release velocity so the visual
        speed continues the user's gesture rather than stalling. */
    closeMinMs: 140,
    closeMaxMs: 280,
  },
  /** Lightbox FLIP timings — paired with .archiveSheet__panel canvas-fade in CSS. */
  lightboxOpenSec: 0.32,
  lightboxOpenEase: 'expo.out',
  lightboxCloseSec: 0.24,
  lightboxCloseEase: 'power2.in',
} as const

/** Tighter elastic lag for the in-sheet grid — half of the default profile so
    the masonry feels "alive but composed", not bouncy. */
const SHEET_GRID_LAG = {
  baseLagSec: 0.005,
  lagScaleSec: 0.012,
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
  const lightboxImgRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
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

  /* Single source of truth for "start the close animation". Used both by the
     parent-driven path (X button, scrim, ESC, navigation) and by the gesture
     commit path — calling it synchronously from the gesture handler means the
     panel's data-state flips in the SAME React render that clears the inline
     drag transform, so the browser interpolates directly from the dragged
     position to translateY(100%) with no intermediate snap-back.

     `durationMs` lets the gesture path pass a shorter, distance/velocity-aware
     duration so a swipe-close keeps the user's momentum instead of stretching
     the remaining travel over the full X-button close clock. */
  const startCloseAnimation = useCallback(
    (durationMs?: number) => {
      if (state === 'closing') return
      if (reducedMotion) {
        onClosed()
        return
      }
      const ms = durationMs ?? TIMING.closeMs
      if (durationMs != null) {
        /* Override the close clock for this one dismiss. Cascades to the panel
           (transition uses var(--sheet-close-ms)) and the shell--sheet-recovering
           rule (same var) so the two stay in lockstep. Cleaned up onClosed. */
        document.documentElement.style.setProperty('--sheet-close-ms', `${ms}ms`)
      }
      setState('closing')
      closeTimerRef.current = window.setTimeout(() => {
        const dlg = dialogRef.current
        if (dlg?.open) dlg.close()
        if (durationMs != null) {
          document.documentElement.style.removeProperty('--sheet-close-ms')
        }
        onClosed()
      }, ms)
    },
    [state, reducedMotion, onClosed],
  )

  /* ───── React to parent flipping `open` ─────
     - open=true after a close already started → cancel the timer, revert to 'open'
     - open=false from 'open' → start exit animation, schedule onClosed
     (No-op if the gesture-commit path already kicked off the close.) */
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
    startCloseAnimation()
  }, [open, state, startCloseAnimation])

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
    const handle = initElasticGridScroll(scrollEl, cols, SHEET_GRID_LAG)
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

  /* ───── Gesture-close (touch swipe down at scrollTop=0) ─────
     Touch only. Wheel-scroll-to-close on desktop was unintuitive (a casual
     trackpad scroll past the top would keep dismissing the drawer); desktop
     users have the close button + scrim + ESC for explicit dismissal.

       1. Drawer follows the finger directly, no damping. The handle drag path
          uses the same panel inline-transform pipeline (`dragOffset`).
       2. Gesture progress (displayed / commitDistance, clamped 0..1) is
          published as `--sheet-drag-progress` on <html>. The shell behind the
          drawer reads it and previews the close (scale, translate, saturate,
          radius all interpolate toward identity).
       3. Release decision is direct: distance > 25% of panel height OR velocity
          > 0.6 px/ms commits dismiss; otherwise we run a 280ms snap-back.
       4. On commit we DON'T snap dragOffset to 0 first — clearing the inline
          transform + peeking class in the same React batch as `onRequestClose`
          lets the dialog's `data-state='closing'` rule pick up from the
          gesture's last rendered position and transition to translateY(100%)
          over close-ms. No jump.

     Skipped under reduced motion (caller doesn't even mount the listeners). */
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl || reducedMotion) return

    const root = document.documentElement
    const cfg = TIMING.overscroll

    const computeCommitDistance = () => {
      const h = panelRef.current?.getBoundingClientRect().height
      return (h && h > 0 ? h : window.innerHeight) * cfg.dismissDistanceFrac
    }

    const s = {
      touchActive: false,
      anchorY: 0,
      lastY: 0,
      lastTime: 0,
      velocity: 0,
      /** Displayed offset, no damping — fed directly to setProgress. */
      offset: 0,
      snappingTimer: 0,
    }

    const setProgress = (displayed: number) => {
      const commit = computeCommitDistance()
      const progress = commit > 0 ? Math.min(1, displayed / commit) : 0
      setDragOffset(displayed)
      root.style.setProperty('--sheet-drag-progress', String(progress))
      /* Suppress shell transitions during active drag so the var change is
         instant (1:1 with finger). Snap-back path re-enables them. */
      root.classList.add('sheet-peeking')
      root.classList.remove('sheet-snapping')
    }

    const startSnapBack = () => {
      /* Hand off from instant-follow to a 280ms transition before clearing the var
         so the shell + panel interpolate together. */
      root.classList.remove('sheet-peeking')
      root.classList.add('sheet-snapping')
      setIsSnappingBack(true)
      setDragOffset(0)
      root.style.setProperty('--sheet-drag-progress', '0')
      if (s.snappingTimer) window.clearTimeout(s.snappingTimer)
      s.snappingTimer = window.setTimeout(() => {
        s.snappingTimer = 0
        setIsSnappingBack(false)
        root.classList.remove('sheet-snapping')
        root.style.removeProperty('--sheet-drag-progress')
      }, TIMING.snapBackMs)
    }

    const evaluateAndRelease = (displayed: number, velocity: number) => {
      const commit = computeCommitDistance()
      const dismiss = displayed > commit || velocity > cfg.dismissVelocity
      if (dismiss) {
        /* Snappy, single-paint close hand-off — no intermediate snap-back, no
           shell delay. Everything below lands in the SAME React batch:

             - sheet-peeking off, --sheet-drag-progress dropped (drag is over).
             - startCloseAnimation(duration) flips local state → 'closing' so
               the panel's data-state changes in the SAME render that clears
               the inline drag transform. Browser interpolates from
               translateY(Ypx) to translateY(100%) over `duration`.
             - setDragOffset(0) removes the inline transform + --dragging class.
             - onRequestClose() runs the parent's close handler, which both
               navigates AND synchronously sets shellSheetState='recovering'.
               That batches with the local state change → one render with
               data-state='closing' AND shell--sheet-recovering. Both panel and
               shell start their close transitions in the same paint.

           Duration is distance + velocity aware: the visual speed continues
           the user's gesture instead of stalling the remaining travel over
           the full close clock. Capped to keep barely-committed swipes from
           being instant and fast flicks from feeling sluggish. */
        const panelHeight = panelRef.current?.getBoundingClientRect().height ?? window.innerHeight
        const remaining = Math.max(0, panelHeight - displayed)
        const speedPxMs = Math.max(velocity, 0.3)
        const duration = Math.min(
          cfg.closeMaxMs,
          Math.max(cfg.closeMinMs, Math.round(remaining / speedPxMs)),
        )
        root.classList.remove('sheet-peeking', 'sheet-snapping')
        root.style.removeProperty('--sheet-drag-progress')
        startCloseAnimation(duration)
        setDragOffset(0)
        onRequestClose()
        return
      }
      startSnapBack()
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      s.touchActive = false
      s.anchorY = t.clientY
      s.lastY = t.clientY
      s.lastTime = performance.now()
      s.velocity = 0
      s.offset = 0
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]!
      const dy = t.clientY - s.anchorY
      if (!s.touchActive) {
        if (scrollEl.scrollTop <= 0 && dy > 0) {
          s.touchActive = true
          /* Re-anchor so offset starts at 0 from the moment we engage. */
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
      s.offset = Math.max(0, t.clientY - s.anchorY)
      setProgress(s.offset)
    }

    const onTouchEndOrCancel = () => {
      if (!s.touchActive) return
      s.touchActive = false
      const offset = s.offset
      const velocity = s.velocity
      s.offset = 0
      s.velocity = 0
      evaluateAndRelease(offset, velocity)
    }

    scrollEl.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollEl.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollEl.addEventListener('touchend', onTouchEndOrCancel, { passive: true })
    scrollEl.addEventListener('touchcancel', onTouchEndOrCancel, { passive: true })

    return () => {
      scrollEl.removeEventListener('touchstart', onTouchStart)
      scrollEl.removeEventListener('touchmove', onTouchMove)
      scrollEl.removeEventListener('touchend', onTouchEndOrCancel)
      scrollEl.removeEventListener('touchcancel', onTouchEndOrCancel)
      if (s.snappingTimer) window.clearTimeout(s.snappingTimer)
      /* Clean state on unmount/remount so a stale .sheet-peeking can't pin the
         shell at a partially-previewed transform. */
      root.classList.remove('sheet-peeking', 'sheet-snapping')
      root.style.removeProperty('--sheet-drag-progress')
    }
  }, [reducedMotion, onRequestClose, startCloseAnimation])

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
      className="archiveSheet"
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
          <svg
            className="archiveSheet__closeIcon"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3.75 3.75 L12.25 12.25 M12.25 3.75 L3.75 12.25" />
          </svg>
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
                      <Squircle
                        cornerRadius={ARCHIVE_CELL_RADIUS}
                        cornerSmoothing={1}
                        className="archiveCellInner"
                        style={{ aspectRatio: `${item.aspectW} / ${item.aspectH}` }}
                      >
                        {item.kind === 'video' ? (
                          <video
                            className="archiveCellImage archiveCellVideo"
                            src={item.src}
                            poster={item.poster}
                            autoPlay
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            disableRemotePlayback
                            draggable={false}
                            onLoadedData={(e) =>
                              e.currentTarget.classList.add('archiveCellImage--ready')
                            }
                          />
                        ) : (
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
                        )}
                        <SquircleMediaStroke
                          cornerRadius={ARCHIVE_CELL_RADIUS}
                          cornerSmoothing={1}
                        />
                      </Squircle>
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
          {lightbox.item.kind === 'video' ? (
            <video
              ref={(node) => {
                lightboxImgRef.current = node
              }}
              className="archiveLightboxImage archiveLightboxVideo"
              src={lightbox.item.src}
              poster={lightbox.item.poster}
              autoPlay
              muted
              loop
              playsInline
              disableRemotePlayback
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
          ) : (
            <img
              ref={(node) => {
                lightboxImgRef.current = node
              }}
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
          )}
          <button
            type="button"
            className="archiveLightboxClose"
            aria-label="Close preview"
            onClick={closeLightbox}
          >
            <svg
              className="archiveLightboxCloseIcon"
              viewBox="0 0 16 16"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3.75 3.75 L12.25 12.25 M12.25 3.75 L3.75 12.25" />
            </svg>
          </button>
        </>
      )}
    </dialog>
  )
}
