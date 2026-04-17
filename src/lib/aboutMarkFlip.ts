/**
 * FLIP helper — about overlay mark enters from the header identity position.
 * First = small wordmark in chrome; Last = final h1 layout (after paint).
 * Invert: translate(first - last) + uniform scale so frame 0 matches `first`.
 */

export type AboutMarkFlipInvert = {
  dx: number
  dy: number
  scale: number
}

export function computeAboutMarkFlipInvert(first: DOMRect, last: DOMRect): AboutMarkFlipInvert | null {
  const lw = Math.max(last.width, 1)
  const lh = Math.max(last.height, 1)
  const fw = first.width
  const fh = first.height
  if (fw < 1 || fh < 1) return null
  /* Uniform scale keeps letterforms undistorted; min() keeps the start box inside both axes */
  const scale = Math.min(fw / lw, fh / lh)
  return {
    dx: first.left - last.left,
    dy: first.top - last.top,
    scale,
  }
}
