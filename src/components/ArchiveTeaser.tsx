import { useCallback, useLayoutEffect, useRef } from 'react'
import { archiveItems } from '../data/archivePlaceholders'
import { preloadArchiveImages } from '../lib/archivePreload'
import { persistArchiveTeaserBounds } from '../lib/archiveTeaserBounds'

type ArchiveTeaserProps = {
  onNavigate: (cardRects: DOMRect[]) => void
}

/* The rail stack is 3 small <img> thumbs — videos can't render in <img>, and a
   12px-tall looping clip wouldn't read anyway. Pick the first 3 image items
   from whatever the (shuffled) grid order happens to be. */
const teaserPreview = archiveItems.filter((item) => item.kind !== 'video').slice(0, 3)
const aboveFoldSrcs = archiveItems.slice(0, 12).map((item) => item.src)
const restSrcs = archiveItems.slice(12).map((item) => item.src)

export function ArchiveTeaser({ onNavigate }: ArchiveTeaserProps) {
  const stackRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLImageElement | null)[]>([])

  useLayoutEffect(() => {
    const el = stackRef.current
    if (!el) return
    const write = () => persistArchiveTeaserBounds(el)
    write()
    window.addEventListener('resize', write)
    return () => window.removeEventListener('resize', write)
  }, [])

  /* Race the bytes on intent so click-to-open is instant. */
  const handlePreload = useCallback(() => {
    preloadArchiveImages(aboveFoldSrcs, 'high')
    preloadArchiveImages(restSrcs, 'low')
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
      onMouseEnter={handlePreload}
      onFocus={handlePreload}
      onTouchStart={handlePreload}
    >
      <div className="archiveTeaserStack" ref={stackRef} aria-hidden>
        {teaserPreview.map((item, i) => (
          <img
            key={item.id}
            className={`archiveTeaserCard archiveTeaserCard--${i + 1}`}
            src={item.src}
            alt=""
            draggable={false}
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
