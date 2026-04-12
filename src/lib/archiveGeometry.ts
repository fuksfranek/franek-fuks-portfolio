/** Viewport rects for FLIP (archive overlay — shared with Portfolio teaser serialization). */
export type ArchivePlainRect = { top: number; left: number; width: number; height: number }

export function teaserTargetsFromStackBounds(bounds: ArchivePlainRect): ArchivePlainRect[] {
  const w = bounds.width * 0.58
  const h = bounds.height * 0.78
  const top = bounds.top + bounds.height * 0.06
  const centers = [
    bounds.left + bounds.width * 0.34,
    bounds.left + bounds.width * 0.5,
    bounds.left + bounds.width * 0.66,
  ]
  return centers.map((cx) => ({
    left: cx - w / 2,
    top,
    width: w,
    height: h,
  }))
}

/** First three tiles match teaser; the rest read as deeper layers of the same 3-card stack. */
export function stackOriginRect(index: number, teaserTriplet: ArchivePlainRect[]): ArchivePlainRect {
  if (index < 3) return teaserTriplet[index]!
  const base = teaserTriplet[index % 3]!
  const layer = Math.floor(index / 3)
  const jx = ((index * 5) % 7) - 3
  const jy = ((index * 11) % 5) - 2
  return {
    left: base.left + jx * 0.85,
    top: base.top + jy * 0.65 + layer * 1.15,
    width: base.width,
    height: base.height,
  }
}
