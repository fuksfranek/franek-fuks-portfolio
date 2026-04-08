import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SquircleMediaStroke } from './SquircleMediaStroke'
import { Squircle } from '@squircle-js/react'

const WHEEL_PIXELS_PER_CARD = 340
const SLOT_RADIUS = 6
const DIAGONAL_X_PERCENT = 109
const DIAGONAL_Y_PERCENT = -45
const FOLLOW_EASING = 0.16
const SNAP_IDLE_MS = 120
const ABOUT_CAROUSEL_RADIUS = 20

type CarouselItem = {
  id: string
  src: string
  alt: string
}

type AboutInfiniteCarouselProps = {
  items: CarouselItem[]
  revealVersion: number
  active: boolean
}

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length
}

export function AboutInfiniteCarousel({ items, revealVersion, active }: AboutInfiniteCarouselProps) {
  const [position, setPosition] = useState(0)
  const positionRef = useRef(0)
  const targetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const snapTimerRef = useRef<number | null>(null)

  const slots = useMemo(() => Array.from({ length: SLOT_RADIUS * 2 + 1 }, (_, i) => i - SLOT_RADIUS), [])

  const stopAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const startAnimation = useCallback(() => {
    if (rafRef.current !== null) return
    const tick = () => {
      const current = positionRef.current
      const target = targetRef.current
      const delta = target - current
      let next = current + delta * FOLLOW_EASING
      if (Math.abs(delta) < 0.0005) next = target
      positionRef.current = next
      setPosition(next)
      if (Math.abs(target - next) < 0.0005) {
        rafRef.current = null
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const scheduleSnap = useCallback(() => {
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current)
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null
      targetRef.current = Math.round(targetRef.current)
      startAnimation()
    }, SNAP_IDLE_MS)
  }, [startAnimation])

  const onWheel = useCallback(
    (deltaX: number, deltaY: number, event?: WheelEvent | React.WheelEvent<HTMLDivElement>) => {
      if (items.length <= 1) return
      if (event) {
        event.preventDefault()
        event.stopPropagation()
        // Prevent App's window wheel handler from consuming the same event.
        if ('stopImmediatePropagation' in event) event.stopImmediatePropagation()
      }
      const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY
      const delta = dominantDelta / WHEEL_PIXELS_PER_CARD
      if (Math.abs(delta) < 0.0001) return
      targetRef.current += delta
      startAnimation()
      scheduleSnap()
    },
    [items.length, scheduleSnap, startAnimation],
  )

  useEffect(() => {
    if (!active) return
    const onWindowWheel = (e: WheelEvent) => {
      onWheel(e.deltaX, e.deltaY, e)
    }
    window.addEventListener('wheel', onWindowWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWindowWheel)
  }, [active, onWheel])

  useEffect(
    () => () => {
      stopAnimation()
      if (snapTimerRef.current !== null) {
        window.clearTimeout(snapTimerRef.current)
        snapTimerRef.current = null
      }
    },
    [stopAnimation],
  )

  if (items.length === 0) return null

  const base = Math.floor(position)
  const frac = position - base

  return (
    <div
      className="aboutOverlayCarouselWrap"
      onWheel={(e) => onWheel(e.deltaX, e.deltaY, e)}
      onClick={(e) => {
        e.stopPropagation()
      }}
      aria-label="About image carousel"
    >
      <div className="aboutCarouselViewport">
        {slots.map((k) => {
          const itemIndex = wrapIndex(base + k, items.length)
          const item = items[itemIndex]
          const offset = k - frac
          const absOffset = Math.abs(offset)
          const isActive = absOffset < 0.5
          return (
            <figure
              key={`about-slot-${k}-${revealVersion}`}
              className="aboutCarouselSlide"
              style={
                {
                  '--about-slide-offset': offset,
                  '--about-slide-abs-offset': absOffset,
                  '--about-slide-x': `${offset * DIAGONAL_X_PERCENT}%`,
                  '--about-slide-y': `${offset * DIAGONAL_Y_PERCENT}%`,
                  '--about-intro-delay': '0ms',
                } as React.CSSProperties
              }
              data-active={isActive ? 'true' : undefined}
              aria-hidden={!isActive}
            >
              <Squircle
                cornerRadius={ABOUT_CAROUSEL_RADIUS}
                cornerSmoothing={1}
                className="aboutCarouselSquircle"
              >
                <img src={item.src} alt={item.alt} draggable={false} />
                <SquircleMediaStroke cornerRadius={ABOUT_CAROUSEL_RADIUS} cornerSmoothing={1} />
              </Squircle>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
