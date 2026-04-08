import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext'
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react'

/** Matches `.projectInfoTitle` / `--font-size-h3` + `--line-height-heading` */
const FONT_TITLE = '500 20px Inter'
const LINE_HEIGHT_TITLE_PX = 25

/** Matches `.projectInfoBody` / `.aboutOverlayBody` — `--font-size-base` + `--line-height-body-px` */
const FONT_BODY = '400 16px Inter'
const LINE_HEIGHT_BODY_PX = 24

function renderLineWithOptionalLink(
  line: string,
  link?: { match: string; href: string },
): ReactNode {
  if (!link) return line
  const { match, href } = link
  const idx = line.indexOf(match)
  if (idx === -1) return line
  return (
    <>
      {line.slice(0, idx)}
      <a href={href}>{match}</a>
      {line.slice(idx + match.length)}
    </>
  )
}

type Props = {
  as?: 'h2' | 'p'
  variant: 'title' | 'body'
  className?: string
  text: string
  /** When a line contains this substring, wrap it in <a href={href}> */
  linkInLine?: { match: string; href: string }
}

export function TypographyRevealLines({ as: Tag = 'p', variant, className, text, linkInLine }: Props) {
  const wrapRef = useRef<HTMLHeadingElement | HTMLParagraphElement | null>(null)
  const [width, setWidth] = useState(0)

  const font = variant === 'title' ? FONT_TITLE : FONT_BODY
  const lineHeightPx = variant === 'title' ? LINE_HEIGHT_TITLE_PX : LINE_HEIGHT_BODY_PX

  const prepared = useMemo(
    () => prepareWithSegments(text, font, { whiteSpace: 'pre-wrap' }),
    [text, font],
  )

  const lines = useMemo(() => {
    const w = width >= 8 ? width : 320
    const { lines: ls } = layoutWithLines(prepared, w, lineHeightPx)
    return ls.map((l) => l.text)
  }, [prepared, width, lineHeightPx])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <Tag ref={wrapRef} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="typographyRevealLine">
          {renderLineWithOptionalLink(line, linkInLine)}
        </span>
      ))}
    </Tag>
  )
}
