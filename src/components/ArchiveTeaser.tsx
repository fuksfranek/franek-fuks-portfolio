import { useLayoutEffect, useRef } from 'react'
import { ARCHIVE_TEASER_COLORS } from '../data/archivePlaceholders'
import { persistArchiveTeaserBounds } from '../lib/archiveTeaserBounds'

type ArchiveTeaserProps = {
  onNavigate: (cardRects: DOMRect[]) => void
}

export function ArchiveTeaser({ onNavigate }: ArchiveTeaserProps) {
  const stackRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLSpanElement | null)[]>([])

  useLayoutEffect(() => {
    const el = stackRef.current
    if (!el) return
    const write = () => persistArchiveTeaserBounds(el)
    write()
    window.addEventListener('resize', write)
    return () => window.removeEventListener('resize', write)
  }, [])

  const handleActivate = () => {
    const rects = cardRefs.current.map((node) => node?.getBoundingClientRect()).filter(Boolean) as DOMRect[]
    if (rects.length !== 3) return
    onNavigate(rects)
  }

  return (
    <button
      type="button"
      className="archiveTeaser"
      role="listitem"
      aria-label="See the archive"
      onClick={handleActivate}
    >
      <div className="archiveTeaserStack" ref={stackRef} aria-hidden>
        {ARCHIVE_TEASER_COLORS.map((color, i) => (
          <span
            key={color}
            className={`archiveTeaserCard archiveTeaserCard--${i + 1}`}
            style={{ background: color }}
            ref={(node) => {
              cardRefs.current[i] = node
            }}
          />
        ))}
      </div>
      <span className="archiveTeaserLabel">see the archive</span>
    </button>
  )
}
