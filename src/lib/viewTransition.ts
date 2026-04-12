/**
 * Wraps updates in `document.startViewTransition` when supported so CSS
 * `::view-transition-*` can style the cross-fade (e.g. archive surface).
 * Skipped when `prefers-reduced-motion: reduce` — pair with `flushSync` in the
 * caller when updating React state inside the callback.
 */
export function runWithViewTransition(update: () => void): void {
  if (typeof document === 'undefined') {
    update()
    return
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update()
    return
  }
  const doc = document as Document & {
    startViewTransition?: (cb: () => void | Promise<void>) => unknown
  }
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(update)
    return
  }
  update()
}
