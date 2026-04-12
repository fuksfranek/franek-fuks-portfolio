const TEASER_BOUNDS_KEY = 'archive-teaser-bounds'

export type TeaserStackBounds = {
  left: number
  top: number
  width: number
  height: number
}

export function persistArchiveTeaserBounds(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  sessionStorage.setItem(
    TEASER_BOUNDS_KEY,
    JSON.stringify({ left: r.left, top: r.top, width: r.width, height: r.height }),
  )
}

export function readArchiveTeaserBoundsFromSession(): TeaserStackBounds | null {
  try {
    const raw = sessionStorage.getItem(TEASER_BOUNDS_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Record<string, number>
    if (
      typeof o.left !== 'number' ||
      typeof o.top !== 'number' ||
      typeof o.width !== 'number' ||
      typeof o.height !== 'number'
    ) {
      return null
    }
    return { left: o.left, top: o.top, width: o.width, height: o.height }
  } catch {
    return null
  }
}
