import { getSvgPath } from 'figma-squircle'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

type SquircleMediaStrokeProps = {
  cornerRadius: number
  cornerSmoothing: number
}

/**
 * Inset ring that follows the figma squircle path (same as {@link Squircle} from @squircle-js/react).
 * Renders above img/video; parent clip-path hides the outer half of the stroke so ~1px reads inside the frame.
 */
export function SquircleMediaStroke({ cornerRadius, cornerSmoothing }: SquircleMediaStrokeProps) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const path = useMemo(() => {
    if (size.w <= 0 || size.h <= 0) return ''
    return getSvgPath({
      width: size.w,
      height: size.h,
      cornerRadius,
      cornerSmoothing,
    })
  }, [size.w, size.h, cornerRadius, cornerSmoothing])

  return (
    <span ref={wrapRef} className="squircleMediaStroke" aria-hidden>
      {path ? (
        <svg
          className="squircleMediaStrokeSvg"
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
        >
          <path
            d={path}
            fill="none"
            stroke="var(--media-frame-border)"
            strokeWidth={2}
            vectorEffect="nonScalingStroke"
          />
        </svg>
      ) : null}
    </span>
  )
}
