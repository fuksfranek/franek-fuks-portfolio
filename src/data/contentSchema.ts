export type MediaBackground =
  | { kind: 'color'; value: string }
  | { kind: 'image'; src: string; fit?: 'cover' | 'contain'; position?: string }

export type MediaPresentation =
  | { mode?: 'fill'; objectPosition?: string }
  | {
      mode: 'framed'
      background?: MediaBackground
      padding?: string
      objectPosition?: string
      mediaFit?: 'contain' | 'cover'
      shadow?: 'soft' | 'none'
    }

type MediaBase = {
  presentation?: MediaPresentation
}

export type Media =
  | ({ kind: 'image'; src: string; alt: string } & MediaBase)
  | ({ kind: 'video'; src: string; poster?: string } & MediaBase)

export type ProjectCategory = string

export type Project = {
  id: string
  /** Line under the thumbnail in the bottom slider */
  label: string
  /** Small descriptor under the rail-card title */
  category: ProjectCategory
  /** Shown on the card; can match first gallery item or be a dedicated still */
  cover: Media
  /** Full-viewport assets when this project is selected */
  gallery: Media[]
  /** Side panel copy when “info” is open; falls back to defaultProjectDescription */
  description?: string
}

export type ContentProject = Omit<Project, 'gallery'> & {
  /** Controls rail order without relying on glob/file order. */
  order: number
  /** Up to ten manually managed project-view assets. Cover media is never injected here. */
  gallery?: Media[]
}

export type ArchiveItemKind = 'image' | 'video'

export type ArchiveItem = {
  id: string
  src: string
  alt: string
  aspectW: number
  aspectH: number
  kind: ArchiveItemKind
  /** Optional poster frame for video cells (kind === 'video'). */
  poster?: string
}

export type ArchiveContentItem = {
  id?: string
  file: string
  alt?: string
  aspectW: number
  aspectH: number
  kind?: ArchiveItemKind
  poster?: string
}

export type ArchiveContent = {
  aboveFoldCount?: number
  teaserItemIds?: string[]
  items: ArchiveContentItem[]
}

function withAssetVersion(src: string, assetVersion: string) {
  if (!assetVersion || src.includes('?') || /^(data:|blob:|https?:)/.test(src)) return src
  const query = assetVersion.startsWith('?') ? assetVersion : `?${assetVersion}`
  return `${src}${query}`
}

function mediaBackgroundWithVersion(
  background: MediaBackground | undefined,
  assetVersion: string,
): MediaBackground | undefined {
  if (!background || background.kind !== 'image') return background
  return {
    ...background,
    src: withAssetVersion(background.src, assetVersion),
  }
}

function mediaWithVersion(media: Media, assetVersion: string): Media {
  const presentation =
    media.presentation?.mode === 'framed'
      ? {
          ...media.presentation,
          background: mediaBackgroundWithVersion(media.presentation.background, assetVersion),
        }
      : media.presentation

  if (media.kind === 'video') {
    return {
      ...media,
      src: withAssetVersion(media.src, assetVersion),
      poster: media.poster ? withAssetVersion(media.poster, assetVersion) : undefined,
      presentation,
    }
  }

  return {
    ...media,
    src: withAssetVersion(media.src, assetVersion),
    presentation,
  }
}

function assertProjectContent(project: ContentProject) {
  if (!project.id || !project.label) {
    throw new Error(`Project content is missing id or label: ${JSON.stringify(project)}`)
  }

  if ((project.gallery?.length ?? 0) > 10) {
    throw new Error(`Project "${project.id}" has more than 10 gallery assets.`)
  }
}

export function normalizeProject(project: ContentProject, assetVersion: string): Project {
  assertProjectContent(project)

  const cover = mediaWithVersion(project.cover, assetVersion)
  const gallery = (project.gallery ?? []).map((media) => mediaWithVersion(media, assetVersion))

  return {
    id: project.id,
    label: project.label,
    category: project.category,
    cover,
    gallery,
    description: project.description,
  }
}

export function normalizeProjects(projects: readonly ContentProject[], assetVersion: string): Project[] {
  const seen = new Set<string>()
  return [...projects]
    .sort((a, b) => a.order - b.order)
    .map((project) => {
      if (seen.has(project.id)) {
        throw new Error(`Duplicate project id "${project.id}" in content/projects.`)
      }
      seen.add(project.id)
      return normalizeProject(project, assetVersion)
    })
}

export function normalizeArchive(content: ArchiveContent): ArchiveItem[] {
  return content.items.map((item, index) => ({
    id: item.id ?? `archive-${index + 1}`,
    src: `/images/archive/${item.file}`,
    alt: item.alt ?? `Archive ${index + 1}`,
    aspectW: item.aspectW,
    aspectH: item.aspectH,
    kind: item.kind ?? 'image',
    poster: item.poster ? `/images/archive/${item.poster}` : undefined,
  }))
}

export function pickArchiveTeaserItems(
  items: readonly ArchiveItem[],
  teaserItemIds: readonly string[] | undefined,
): ArchiveItem[] {
  if (!teaserItemIds?.length) return items.filter((item) => item.kind === 'image').slice(0, 4)

  const byId = new Map(items.map((item) => [item.id, item]))
  return teaserItemIds
    .map((id) => byId.get(id))
    .filter((item): item is ArchiveItem => item?.kind === 'image')
}
