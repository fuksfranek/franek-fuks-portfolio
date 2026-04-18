import gsap from 'gsap'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { archiveItems } from '../data/archivePlaceholders'
import type { ArchivePlainRect } from '../lib/archiveGeometry'
import { stackOriginRect, teaserTargetsFromStackBounds } from '../lib/archiveGeometry'
import { readArchiveTeaserBoundsFromSession } from '../lib/archiveTeaserBounds'
import { easeViewInset } from '../lib/easeViewInset'
import '../ArchivePage.css'

const TILE_COUNT = archiveItems.length

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — archive overlay (hash #archive)
 *
 * Read top-to-bottom. ms are wall-clock from the trigger.
 *
 * ENTER (stack → masonry)
 *    0ms   25 fly clones spawn at the teaser stack origin
 *          (opacity 0.55, scaled to teaser thumbnail size).
 *          Real cells render with opacity 0 at their final masonry
 *          positions (layout already settled — no reflow during flight).
 *
 *    0ms   Per-clone flight to target starts (stagger 6ms — tight enough
 *          that the wave reads as one unified gesture, not column-by-column):
 *          • 0–140 ms : clone fades 0.55 → 1   (masks the spawn pop)
 *          • 0–620 ms : translate + scale, easeOutQuint (soft tail)
 *          • at 55%  : matching real cell crossfade-in begins
 *                      (CSS opacity 0→1, 280 ms ease-out-quint)
 *          • last 200ms : clone tail-fades 1 → 0 (power2.in)
 *          → cell + clone overlap ≥ 1 for the whole handoff window;
 *            no empty frame, no shadow pop.
 *
 *  764ms   Last clone lands → master onComplete reconciles
 *          flyPending=false (no-op if all per-cell handoffs ran)
 *          and removes the fly host. dockReady flips → back button
 *          fades + scales in over 220ms (it was hidden the whole time
 *          so the flying clones never appeared "in front of" it).
 *
 * EXIT (Back — one shared clock)
 *    0ms   shell--archive-revealing + --archive-shell-reveal-ms = EXIT_TOTAL_MS
 *          (CSS --ease-view-inset on shell opacity/blur)
 *    0ms   overlay opacity 1 → 0 over EXIT_TOTAL_MS (easeViewInset)
 *    0ms   25 FLIP clones grid → stack: stagger EXIT_STAGGER_MS,
 *          per-tile duration fills EXIT_TOTAL_MS (power2.inOut —
 *          gentler on-screen travel than power3.in)
 *  EXIT_TOTAL_MS   unmount + clear hash
 * ───────────────────────────────────────────────────────── */

/**
 * Soft ease-out, equivalent to cubic-bezier(0.22, 1, 0.36, 1).
 * Heavily weighted long tail — element decelerates over a longer
 * window than ease-out-cubic, masking the precise landing moment.
 */
function easeOutQuint(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return 1 - Math.pow(1 - t, 5)
}

const TIMING = {
  /* ENTER (per-tile clock) */
  enterFlightMs: 620,
  enterStaggerMs: 6,
  enterCloneFadeInMs: 140,
  enterCloneFadeOutMs: 200,
  enterCellRevealAtFraction: 0.55, // hand off to real cell at this point of each clone's flight
  enterCloneInitialOpacity: 0.55,
  enterEase: easeOutQuint,

  /* EXIT (single shared budget) */
  exitTotalMs: 360,
  exitStaggerMs: 5,
  exitEase: 'power2.inOut',
  exitOverlayEase: easeViewInset,
} as const

/** Per-clone exit duration so that the last-staggered clone still finishes inside EXIT_TOTAL_MS. */
function exitFlyDurationSec(tileCount: number): number {
  const span = TIMING.exitTotalMs / 1000
  const stagger = TIMING.exitStaggerMs / 1000
  return Math.max(0.24, span - (tileCount - 1) * stagger)
}

function isPlainRect(value: unknown): value is ArchivePlainRect {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    typeof o.top === 'number' &&
    typeof o.left === 'number' &&
    typeof o.width === 'number' &&
    typeof o.height === 'number'
  )
}

function fallbackStackBounds(): ArchivePlainRect {
  return {
    left: window.innerWidth * 0.5 - 65,
    top: window.innerHeight - 152,
    width: 130,
    height: 104,
  }
}

function resolveTeaserTriplet(entry: ArchivePlainRect[] | null | undefined): ArchivePlainRect[] {
  if (entry && entry.length === 3 && entry.every(isPlainRect)) return entry
  const bounds = readArchiveTeaserBoundsFromSession() ?? fallbackStackBounds()
  return teaserTargetsFromStackBounds(bounds)
}

/**
 * ENTER: spawn a clone at `from`, fly to `to`, crossfade-handoff to the
 * real cell at `revealAtFraction` of the flight, then tail-fade to 0.
 *
 * The clone uses GPU-only props (transform + opacity) for the duration.
 */
function flyCardEnter(
  host: HTMLElement,
  color: string,
  from: ArchivePlainRect,
  to: ArchivePlainRect,
  zIndex: number,
  onHandoff: () => void,
): gsap.core.Timeline {
  const el = document.createElement('div')
  el.className = 'archiveFlyCard archiveFlyCard--enter'
  el.style.background = color
  el.style.borderRadius = '14px'
  /* Lighter shadow during flight so the moment the real cell crossfades
   * in (with its heavier shadow) reads as "settling," not "popping." */
  el.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.18)'
  host.appendChild(el)

  const flightSec = TIMING.enterFlightMs / 1000
  const fadeInSec = TIMING.enterCloneFadeInMs / 1000
  const fadeOutSec = TIMING.enterCloneFadeOutMs / 1000
  const handoffAtSec = (TIMING.enterFlightMs * TIMING.enterCellRevealAtFraction) / 1000
  const tailStartSec = Math.max(handoffAtSec, flightSec - fadeOutSec)

  gsap.set(el, {
    position: 'fixed',
    left: 0,
    top: 0,
    width: to.width,
    height: to.height,
    x: from.left,
    y: from.top,
    scaleX: from.width / to.width,
    scaleY: from.height / to.height,
    transformOrigin: '0 0',
    force3D: true,
    willChange: 'transform, opacity',
    zIndex,
    pointerEvents: 'none',
    opacity: TIMING.enterCloneInitialOpacity,
  })

  const tl = gsap.timeline({
    onComplete: () => {
      el.remove()
    },
  })

  tl.to(
    el,
    {
      x: to.left,
      y: to.top,
      scaleX: 1,
      scaleY: 1,
      duration: flightSec,
      ease: TIMING.enterEase,
    },
    0,
  )

  tl.to(
    el,
    {
      opacity: 1,
      duration: fadeInSec,
      ease: TIMING.enterEase,
    },
    0,
  )

  tl.call(onHandoff, undefined, handoffAtSec)

  tl.to(
    el,
    {
      opacity: 0,
      duration: fadeOutSec,
      ease: 'power2.in',
    },
    tailStartSec,
  )

  return tl
}

/** EXIT: simple FLIP clone, gathers from grid back to stack. No fade. */
function flyCardExit(
  host: HTMLElement,
  color: string,
  from: ArchivePlainRect,
  to: ArchivePlainRect,
  durationSec: number,
  ease: string,
  zIndex: number,
): gsap.core.Timeline {
  const el = document.createElement('div')
  el.className = 'archiveFlyCard archiveFlyCard--exit'
  el.style.background = color
  el.style.borderRadius = '14px'
  el.style.boxShadow = '0 12px 28px rgba(16, 22, 31, 0.12)'
  host.appendChild(el)

  gsap.set(el, {
    position: 'fixed',
    left: 0,
    top: 0,
    width: to.width,
    height: to.height,
    x: from.left,
    y: from.top,
    scaleX: from.width / to.width,
    scaleY: from.height / to.height,
    transformOrigin: '0 0',
    force3D: true,
    willChange: 'transform',
    zIndex,
    pointerEvents: 'none',
  })

  const tl = gsap.timeline({
    onComplete: () => {
      el.remove()
    },
  })
  tl.to(el, {
    x: to.left,
    y: to.top,
    scaleX: 1,
    scaleY: 1,
    duration: durationSec,
    ease,
  })
  return tl
}

function addEnterFlights(
  master: gsap.core.Timeline,
  host: HTMLElement,
  triplet: ArchivePlainRect[],
  targets: ArchivePlainRect[],
  cellRefs: (HTMLButtonElement | null)[],
) {
  const step = TIMING.enterStaggerMs / 1000
  archiveItems.forEach((item, i) => {
    master.add(
      flyCardEnter(host, item.color, stackOriginRect(i, triplet), targets[i]!, 200 + i, () => {
        const cell = cellRefs[i]
        if (cell) cell.classList.remove('archiveCell--flyPending')
      }),
      i * step,
    )
  })
}

function addExitFlights(
  master: gsap.core.Timeline,
  host: HTMLElement,
  triplet: ArchivePlainRect[],
  fromRects: ArchivePlainRect[],
  flyDurSec: number,
) {
  const step = TIMING.exitStaggerMs / 1000
  archiveItems.forEach((item, i) => {
    const z = 260 + (TILE_COUNT - 1 - i)
    master.add(
      flyCardExit(host, item.color, fromRects[i]!, stackOriginRect(i, triplet), flyDurSec, TIMING.exitEase, z),
      i * step,
    )
  })
}

type ArchiveOverlayProps = {
  entryRects: ArchivePlainRect[] | null
  onClosed: () => void
  /** Portfolio shell uses this duration (ms) for opacity/blur reveal, in sync with exit motion. */
  onShellRevealStart: (motionDurationMs: number) => void
}

export function ArchiveOverlay({ entryRects, onClosed, onShellRevealStart }: ArchiveOverlayProps) {
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [flyPending, setFlyPending] = useState(() => !reducedMotion)
  /* Dock back-button stays hidden during enter so it never appears "behind"
   * the flying clones (which spawn near the bottom-center, right where the
   * dock sits). Reveals once cards have settled. */
  const [dockReady, setDockReady] = useState(() => reducedMotion)
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  const overlayRootRef = useRef<HTMLDivElement>(null)
  const flyHostRef = useRef<HTMLDivElement | null>(null)
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const exitLockRef = useRef(false)
  const enterCtxRef = useRef<gsap.Context | null>(null)
  const exitTimelineRef = useRef<gsap.core.Timeline | null>(null)

  const ensureFlyHost = useCallback(() => {
    if (flyHostRef.current) return flyHostRef.current
    const el = document.createElement('div')
    el.setAttribute('data-archive-fly-host', 'true')
    el.style.position = 'fixed'
    el.style.inset = '0'
    el.style.pointerEvents = 'none'
    el.style.zIndex = '250'
    document.body.appendChild(el)
    flyHostRef.current = el
    return el
  }, [])

  const removeFlyHost = useCallback(() => {
    flyHostRef.current?.remove()
    flyHostRef.current = null
  }, [])

  useLayoutEffect(() => {
    if (reducedMotion) return

    const host = ensureFlyHost()
    enterCtxRef.current?.revert()
    enterCtxRef.current = gsap.context(() => {
      const triplet = resolveTeaserTriplet(entryRects)

      const measureTargets = (): ArchivePlainRect[] | null => {
        const out: ArchivePlainRect[] = []
        for (let i = 0; i < TILE_COUNT; i += 1) {
          const el = cellRefs.current[i]
          if (!el) return null
          const r = el.getBoundingClientRect()
          out.push({ left: r.left, top: r.top, width: r.width, height: r.height })
        }
        return out
      }

      const run = () => {
        const targets = measureTargets()
        if (!targets) {
          requestAnimationFrame(run)
          return
        }

        const master = gsap.timeline({
          onComplete: () => {
            /* Reconciliation: per-cell handoffs already removed --flyPending
             * from each cell as its clone landed. Setting state here is a
             * safety net so React's source of truth matches the DOM. */
            setFlyPending(false)
            setDockReady(true)
            removeFlyHost()
          },
        })
        addEnterFlights(master, host, triplet, targets, cellRefs.current)
      }

      run()
    }, host)

    return () => {
      enterCtxRef.current?.revert()
      enterCtxRef.current = null
      removeFlyHost()
    }
  }, [ensureFlyHost, entryRects, reducedMotion, removeFlyHost])

  const finishClose = useCallback(() => {
    exitTimelineRef.current = null
    removeFlyHost()
    exitLockRef.current = false
    /* Do not clear GSAP opacity here: clearProps would snap overlay back to opacity 1 for a frame before unmount. */
    onClosed()
  }, [onClosed, removeFlyHost])

  const handleBack = useCallback(() => {
    if (exitLockRef.current) return
    if (lightboxId) {
      setLightboxId(null)
      return
    }

    if (reducedMotion) {
      finishClose()
      return
    }

    exitLockRef.current = true
    onShellRevealStart(TIMING.exitTotalMs)

    const host = ensureFlyHost()
    const exitTriplet = resolveTeaserTriplet(entryRects)
    const flyDurSec = exitFlyDurationSec(TILE_COUNT)
    const exitSpanSec = TIMING.exitTotalMs / 1000

    const fromRects: ArchivePlainRect[] = []
    for (let i = 0; i < TILE_COUNT; i += 1) {
      const el = cellRefs.current[i]
      if (!el) {
        finishClose()
        return
      }
      const r = el.getBoundingClientRect()
      fromRects.push({ left: r.left, top: r.top, width: r.width, height: r.height })
    }

    for (let i = 0; i < TILE_COUNT; i += 1) {
      const el = cellRefs.current[i]
      if (el) el.style.visibility = 'hidden'
    }

    const overlayEl = overlayRootRef.current
    const master = gsap.timeline({
      onComplete: finishClose,
    })
    exitTimelineRef.current = master

    if (overlayEl) {
      master.fromTo(
        overlayEl,
        { opacity: 1 },
        { opacity: 0, duration: exitSpanSec, ease: TIMING.exitOverlayEase },
        0,
      )
    }

    addExitFlights(master, host, exitTriplet, fromRects, flyDurSec)
  }, [
    ensureFlyHost,
    entryRects,
    finishClose,
    lightboxId,
    onShellRevealStart,
    reducedMotion,
  ])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleBack])

  useEffect(
    () => () => {
      exitTimelineRef.current?.kill()
      exitTimelineRef.current = null
    },
    [],
  )

  const lightboxItem = lightboxId ? archiveItems.find((x) => x.id === lightboxId) : null

  return (
    <div
      ref={overlayRootRef}
      className="archivePage archiveOverlay"
      role="dialog"
      aria-modal="true"
      aria-label="Archive"
    >
      <div className="archivePageContent">
        <div className="archiveScroll">
          <div className="archiveMasonry" role="list">
            {archiveItems.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                ref={(node) => {
                  cellRefs.current[i] = node
                }}
                className={`archiveCell ${flyPending ? 'archiveCell--flyPending' : ''}`}
                aria-label={`Open archive item ${i + 1}`}
                onClick={() => setLightboxId(item.id)}
              >
                <div
                  className="archiveCellInner"
                  style={{
                    aspectRatio: `${item.aspectW} / ${item.aspectH}`,
                    background: item.color,
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="archiveBackDock">
          <button
            type="button"
            className={`archiveBack archiveBack--dock ${dockReady ? '' : 'archiveBack--dock--pending'}`}
            onClick={handleBack}
            aria-hidden={!dockReady}
            tabIndex={dockReady ? 0 : -1}
          >
            Back
          </button>
        </div>
      </div>

      {lightboxItem &&
        createPortal(
          <div
            className="archiveLightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Archive preview"
            onClick={() => setLightboxId(null)}
          >
            <div className="archiveLightboxInner" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="archiveLightboxClose"
                aria-label="Close preview"
                onClick={() => setLightboxId(null)}
              >
                ×
              </button>
              <div
                className="archiveLightboxSwatch"
                style={{
                  aspectRatio: `${lightboxItem.aspectW} / ${lightboxItem.aspectH}`,
                  background: lightboxItem.color,
                }}
              />
              <p className="archiveLightboxCaption">
                Placeholder {archiveItems.indexOf(lightboxItem) + 1} — swap for your archive image.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
