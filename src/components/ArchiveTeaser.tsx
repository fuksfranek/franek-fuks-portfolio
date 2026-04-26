import { useCallback, type CSSProperties } from 'react'
import { archiveAboveFoldCount, archiveItems, archiveTeaserItems } from '../data/archivePlaceholders'
import { preloadArchiveImages } from '../lib/archivePreload'

type ArchiveTeaserProps = {
  onNavigate: () => void
  style?: CSSProperties
}

const aboveFoldSrcs = archiveItems.slice(0, archiveAboveFoldCount).map((item) => item.src)
const restSrcs = archiveItems.slice(archiveAboveFoldCount).map((item) => item.src)
const stackImages = archiveTeaserItems.map((item) => item.src)

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
