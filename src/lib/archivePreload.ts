/**
 * Warm the archive media cache before the user opens the overlay.
 * Triggered on teaser hover/focus/touchstart so by click time the bytes are already in memory
 * and the FLIP clones render their images instantly instead of flying as empty boxes.
 *
 * Image entries get a real Image() + decode() so the GPU upload finishes before paint.
 * Video entries skip eager preload — autoplay metadata loading is enough, and full-byte
 * preloads on hover would chew through bandwidth for clips the user might never click.
 */

const inFlight = new Set<string>()

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i

export function preloadArchiveImages(srcs: readonly string[], priority: 'high' | 'low' = 'low') {
  if (typeof window === 'undefined') return
  for (const src of srcs) {
    if (inFlight.has(src)) continue
    if (VIDEO_EXT.test(src)) continue
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
