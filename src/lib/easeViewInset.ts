/**
 * Matches CSS `var(--ease-view-inset)` / `cubic-bezier(0.215, 0.61, 0.355, 1)` (index.css).
 * Use as GSAP `ease` (function), not a string, so motion pairs with shell / overlay CSS transitions.
 */

function bezierX(u: number, x1: number, x2: number) {
  return 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u
}

function bezierY(u: number, y1: number, y2: number) {
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
}

/** y at linear time t for CSS cubic-bezier(x1,y1,x2,y2) */
function cssBezierYAtT(t: number, x1: number, y1: number, x2: number, y2: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2
    const x = bezierX(mid, x1, x2)
    if (x < t) lo = mid
    else hi = mid
  }
  const u = (lo + hi) / 2
  return bezierY(u, y1, y2)
}

/** GSAP ease: same curve as PortfolioApp `easeViewInsetY` + shell/archive CSS */
export function easeViewInset(t: number): number {
  return cssBezierYAtT(t, 0.215, 0.61, 0.355, 1)
}
