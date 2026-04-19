/**
 * Warm the archive image cache (and decode pipeline) before the user opens the overlay.
 * Triggered on teaser hover/focus/touchstart so by click time the bytes are already in memory
 * and the FLIP clones render their images instantly instead of flying as empty boxes.
 */

const inFlight = new Set<string>()

export function preloadArchiveImages(srcs: readonly string[], priority: 'high' | 'low' = 'low') {
  if (typeof window === 'undefined') return
  for (const src of srcs) {
    if (inFlight.has(src)) continue
    inFlight.add(src)
    const img = new Image()
    img.decoding = 'async'
    img.setAttribute('fetchpriority', priority)
    img.src = src
    /* decode() finishes the GPU upload, so the first paint of the real <img> is hitch-free. */
    img.decode().catch(() => {
      inFlight.delete(src)
    })
  }
}
