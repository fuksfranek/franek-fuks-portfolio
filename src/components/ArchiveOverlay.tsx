import gsap from 'gsap'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
 * ENTER (stack → masonry)
 *   0ms    FLIP clones: stagger 5ms; flight uses easeViewInset (same as --ease-view-inset + .archivePageContent)
 *   end    last tile lands ≈ ENTER_FLY_MS + (N-1)*5 ms → show real cells
 *
 * EXIT (Back — one shared clock)
 *   0ms    shell--archive-revealing + --archive-shell-reveal-ms = EXIT_TOTAL_MS (CSS --ease-view-inset)
 *   0ms    overlay opacity 1→0 over EXIT_TOTAL_MS with easeViewInset (paired with shell opacity/blur)
 *   0ms    N FLIP clones grid→stack: stagger EXIT_STAGGER_MS; per-tile duration fills EXIT_TOTAL_MS;
 *          power2.inOut — gentler on-screen travel than strong ease-in (power3.in)
 *   EXIT_TOTAL_MS  unmount + clear hash
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  enterFlyMs: 340,
  enterStaggerMs: 5,
  enterEase: easeViewInset,
  /** Single budget for shell reveal ∥ overlay dissolve ∥ FLIP gather (~15% snappier than enter tail) */
  exitTotalMs: 320,
  exitStaggerMs: 4,
  exitEase: 'power2.inOut',
  exitOverlayEase: easeViewInset,
} as const

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

function flyCard(
  host: HTMLElement,
  color: string,
  from: ArchivePlainRect,
  to: ArchivePlainRect,
  durationSec: number,
  ease: string | ((t: number) => number),
  zIndex: number,
): gsap.core.Timeline {
  const el = document.createElement('div')
  el.className = 'archiveFlyCard'
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
) {
  const dur = TIMING.enterFlyMs / 1000
  const step = TIMING.enterStaggerMs / 1000
  archiveItems.forEach((item, i) => {
    master.add(
      flyCard(
        host,
        item.color,
        stackOriginRect(i, triplet),
        targets[i]!,
        dur,
        TIMING.enterEase,
        200 + i,
      ),
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
      flyCard(host, item.color, fromRects[i]!, stackOriginRect(i, triplet), flyDurSec, TIMING.exitEase, z),
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
            /* Show real cells before removing fly clones — avoids one empty frame (feels like a reload). */
            flushSync(() => {
              setFlyPending(false)
            })
            removeFlyHost()
          },
        })
        addEnterFlights(master, host, triplet, targets)
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
          <button type="button" className="archiveBack archiveBack--dock" onClick={handleBack}>
            ← Back
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
