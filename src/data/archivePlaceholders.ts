import type { ArchiveContent, ArchiveItem, ArchiveItemKind } from './contentSchema'
import { normalizeArchive, pickArchiveTeaserItems } from './contentSchema'

export type { ArchiveItem, ArchiveItemKind }

const archiveModules = import.meta.glob<ArchiveContent>('../../content/archive.json', {
  eager: true,
  import: 'default',
})

/* Real image / video dimensions live in content/archive.json; they drive
   aspectRatio so the masonry lays out before the bytes land. */
const archiveContent = Object.values(archiveModules)[0]

if (!archiveContent) {
  throw new Error('Missing content/archive.json')
}

export const archiveAboveFoldCount = archiveContent.aboveFoldCount ?? 12
export const archiveItems: ArchiveItem[] = normalizeArchive(archiveContent)
export const archiveTeaserItems: ArchiveItem[] = pickArchiveTeaserItems(
  archiveItems,
  archiveContent.teaserItemIds,
)
