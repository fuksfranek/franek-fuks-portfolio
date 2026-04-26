import { useCallback, type CSSProperties } from 'react'
import { archiveItems } from '../data/archivePlaceholders'
import { preloadArchiveImages } from '../lib/archivePreload'

type ArchiveTeaserProps = {
  onNavigate: () => void
  style?: CSSProperties
}

const aboveFoldSrcs = archiveItems.slice(0, 12).map((item) => item.src)
const restSrcs = archiveItems.slice(12).map((item) => item.src)
const stackImages = archiveItems
  .filter((item) => item.kind === 'image')
  .filter((_, index) => [1, 4, 8, 14].includes(index))
  .map((item) => item.src)

export function ArchiveTeaser({ onNavigate, style }: ArchiveTeaserProps) {
  /* Race the bytes on intent so click-to-open is instant. */
  const handlePreload = useCallback(() => {
    preloadArchiveImages(aboveFoldSrcs, 'high')
    preloadArchiveImages(restSrcs, 'low')
  }, [])

  return (
    <button
      type="button"
      className="archiveTeaser"
      style={style}
      role="listitem"
      aria-label="See the archive"
      onClick={onNavigate}
      onMouseEnter={handlePreload}
      onFocus={handlePreload}
      onTouchStart={handlePreload}
    >
      <div className="archiveTeaserStack" aria-hidden>
        <span className="archiveTeaserCards">
          {stackImages.map((src, index) => (
            <span
              key={src}
              className={`archiveTeaserCard archiveTeaserCard--${index + 1}`}
            >
              <img src={src} alt="" draggable={false} decoding="async" loading="lazy" />
            </span>
          ))}
        </span>
        <span className="archiveTeaserLabel">see the archive</span>
      </div>
    </button>
  )
}
