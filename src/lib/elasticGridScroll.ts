/* ─────────────────────────────────────────────────────────
 * Elastic grid scroll — per-column lag for a scroll container.
 *
 * Inspired by Codrops "Elastic Grid Scroll" (Demo 1, symmetric outer column lag),
 * but reimplemented as a vanilla rAF lerp so it doesn't require GSAP ScrollSmoother
 * (a premium plugin we don't ship).
 *
 * Mental model:
 *   - The scroll container scrolls normally; the body of cells doesn't move.
 *   - Each column is a real DOM element. Per frame, every column's "currentY"
 *     lerps toward the live scrollTop. Stiffer columns track instantly,
 *     loose columns drift behind, then ease home when scroll stops.
 *   - We apply `translate3d(0, scrollTop - currentY, 0)` to each column.
 *     During downscroll: currentY < scrollTop → positive offset → column
 *     visually trails (it cancels part of the upward scroll motion).
 *
 * Lag is expressed in seconds (matching the Codrops demo's vocabulary).
 * Steady-state drift at constant scroll velocity v ≈ v × lag.
 *
 * Layout shape:
 *   - 3+ columns → SYMMETRIC: outer columns laggiest, center stays stiff.
 *     Reads as elastic ripple from the edges.
 *   - 2 columns → LINEAR fallback: column 0 stiff, column 1 loose.
 *     Symmetric formula degenerates with even small counts.
 *
 * Ignores `prefers-reduced-motion` — caller decides whether to even mount us.
 * ───────────────────────────────────────────────────────── */

export type ElasticGridOptions = {
  /** Lag (sec) for the stiffest column — center if symmetric, column 0 if linear. */
  baseLagSec?: number
  /** Additional lag (sec) per step away from the stiffest column. */
  lagScaleSec?: number
}

export type ElasticGridHandle = {
  /** Tear down listeners + rAF and clear inline transforms. */
  destroy: () => void
}

/* Tuned for "subtle momentum, not bouncy". Steady-state drift at scroll
   velocity v is roughly v × lag. With these values, a fast 2000 px/s scroll
   pulls outer columns ~70px behind; gentler scrolls drift ~30–40px. Reads
   as the cards having a bit of physical mass without ever looking laggy. */
const DEFAULT_BASE_LAG_SEC = 0.01
const DEFAULT_LAG_SCALE_SEC = 0.025

/** Snap-still threshold (px). Below this we stop animating to save battery. */
const SETTLE_EPSILON_PX = 0.15

export function initElasticGridScroll(
  scrollEl: HTMLElement,
  columnEls: readonly HTMLElement[],
  opts: ElasticGridOptions = {},
): ElasticGridHandle {
  if (columnEls.length === 0) {
    return { destroy: () => {} }
  }

  const baseLag = opts.baseLagSec ?? DEFAULT_BASE_LAG_SEC
  const lagScale = opts.lagScaleSec ?? DEFAULT_LAG_SCALE_SEC

  /* Build per-column lag profile.
     3+ cols: symmetric distance-from-center → outer columns lag more.
     2 cols : linear → col 0 stiff, col 1 loose (symmetric would give equal lag = no relative drift). */
  const useSymmetric = columnEls.length >= 3
  const mid = (columnEls.length - 1) / 2
  const lags = columnEls.map((_, i) => {
    const distance = useSymmetric ? Math.abs(i - mid) : i
    return baseLag + distance * lagScale
  })

  /* Sync starting positions to current scroll so opening at a non-zero scrollTop
     doesn't trigger a one-time fly-in from 0. */
  const initialScroll = scrollEl.scrollTop
  const currentY = new Array<number>(columnEls.length).fill(initialScroll)
  let target = initialScroll
  let lastTs = 0
  let raf = 0

  const applyTransforms = () => {
    for (let i = 0; i < columnEls.length; i += 1) {
      const offset = target - currentY[i]!
      columnEls[i]!.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`
    }
  }

  const tick = (ts: number) => {
    /* Clamp dt: tab-switch returns can deliver multi-second deltas that would
       blow past the lerp into negative oscillation. */
    const dt = lastTs === 0 ? 0.0167 : Math.max(0.001, Math.min(0.05, (ts - lastTs) / 1000))
    lastTs = ts

    let stillMoving = false
    for (let i = 0; i < columnEls.length; i += 1) {
      const lag = lags[i]!
      /* Continuous-time lerp: factor = 1 - exp(-dt/lag). Frame-rate independent.
         Equivalent to dCurrent/dt = (target - current) / lag in the limit. */
      const factor = 1 - Math.exp(-dt / lag)
      const cur = currentY[i]!
      const next = cur + (target - cur) * factor
      currentY[i] = next
      if (Math.abs(target - next) > SETTLE_EPSILON_PX) {
        stillMoving = true
      }
    }
    applyTransforms()

    if (stillMoving) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = 0
      lastTs = 0
      /* Final snap to exactly 0 offset — avoids leaving sub-pixel transforms
         that could subtly affect getBoundingClientRect for the FLIP exit. */
      for (let i = 0; i < columnEls.length; i += 1) {
        currentY[i] = target
      }
      applyTransforms()
    }
  }

  const requestTick = () => {
    if (raf !== 0) return
    lastTs = 0
    raf = requestAnimationFrame(tick)
  }

  const onScroll = () => {
    target = scrollEl.scrollTop
    requestTick()
  }

  scrollEl.addEventListener('scroll', onScroll, { passive: true })

  /* Apply identity transforms now so columns get a stacking context / will-change
     hint immediately, not on first scroll. */
  applyTransforms()

  return {
    destroy: () => {
      scrollEl.removeEventListener('scroll', onScroll)
      if (raf !== 0) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      for (const el of columnEls) {
        el.style.transform = ''
      }
    },
  }
}
