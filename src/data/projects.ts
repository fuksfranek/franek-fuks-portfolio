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

export type Project = {
  id: string
  /** Line under the thumbnail in the bottom slider */
  label: string
  /** Small descriptor under the rail-card title */
  category: 'merch' | 'website' | 'book' | 'art direction' | 'photography'
  /** Shown on the card; can match first gallery item or be a dedicated still */
  cover: Media
  /** Full-viewport assets when this project is selected */
  gallery: Media[]
  /** Side panel copy when “info” is open; falls back to defaultProjectDescription */
  description?: string
}

/** Used when a project omits `description` */
export const defaultProjectDescription =
  'A compact note for selected work, giving just enough context to frame the images while keeping the gallery as the main story.'

/* Manual cache buster appended to every asset URL. Bump this whenever assets
   are replaced in-place (same filename, new bytes) so visitors with cached
   copies refetch on next load. Vite doesn't fingerprint /public files, so a
   query string is the simplest reliable bust without renaming everything. */
const V = '?v=4'

const framedBackgrounds = [
  '#f3eadf',
  '#dfe8ef',
  '#efe4ee',
  '#e7ecd9',
  '#ece7df',
  '#dde7e2',
  '#eee5d8',
  '#e5e2ef',
] as const

function colorIndex(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % framedBackgrounds.length
}

function framedDemoMedia(media: Media, projectId: string): Media {
  return {
    ...media,
    presentation: {
      mode: 'framed',
      background: { kind: 'color', value: framedBackgrounds[colorIndex(projectId)] },
      padding: 'clamp(2rem, 7vw, 6.5rem)',
      mediaFit: 'cover',
      objectPosition: 'center',
      shadow: 'soft',
    },
  }
}

function gallery(project: Omit<Project, 'gallery'> & { gallery?: Media[] }): Project {
  const { gallery: g, ...rest } = project
  const fullBleed = g?.[0] ?? rest.cover
  return {
    ...rest,
    gallery: [fullBleed, framedDemoMedia(rest.cover, rest.id)],
  }
}

/* ────────────────────────────────────────────────────────────
 * Project order = rail order. The list below is a one-shot
 * deterministic shuffle (mulberry32, seed 0x7e2d91) of the 14
 * portfolio entries — baked in so the rail stays consistent
 * across reloads. Re-roll by changing the seed in chat tools.
 * ──────────────────────────────────────────────────────────── */
export const projects: Project[] = [
  gallery({
    id: 'osom-pictures',
    label: 'OSOM Pictures',
    category: 'photography',
    cover: {
      kind: 'image',
      src: `/images/projects/osom-pictures/cover/pictures.png${V}`,
      alt: 'OSOM Pictures cover',
    },
    gallery: [
      {
        kind: 'video',
        src: `/images/projects/osom-pictures/video/osom-pictures-video1.mp4${V}`,
        poster: `/images/projects/osom-pictures/cover/pictures.png${V}`,
      },
    ],
  }),
  gallery({
    id: 'dawid-podsiadlo-merch',
    label: 'Dawid Podsiadło — merch',
    category: 'merch',
    cover: {
      kind: 'image',
      src: `/images/projects/dawid-podsiadlo-merch/cover/podsiad-merch.png${V}`,
      alt: 'Dawid Podsiadło merch',
    },
  }),
  gallery({
    id: 'one-way',
    label: 'One-way',
    category: 'art direction',
    description:
      'One-way follows a single direction through image, type, and rhythm so the piece reads as one continuous gesture rather than isolated frames. The work grew out of print and motion studies that were folded into a single narrative arc.\n\nColor, scale, and pacing were adjusted until each beat felt inevitable. The gallery mirrors that progression—full-screen, automatic, and meant to be watched in order as much as browsed.',
    cover: {
      kind: 'image',
      src: `/images/projects/one-way/cover/one-way.png${V}`,
      alt: 'One-way cover',
    },
    gallery: [
      {
        kind: 'video',
        src: `/images/projects/one-way/video/One%20Way%20Full%20Video.mp4${V}`,
        poster: `/images/projects/one-way/cover/one-way.png${V}`,
      },
    ],
  }),
  gallery({
    id: 'pro8l3m-instrumentals-cover',
    label: 'PRO8L3M Instrumentals',
    category: 'book',
    cover: {
      kind: 'image',
      src: `/images/projects/pro8l3m-instrumentals-cover/cover/Pro83m.png${V}`,
      alt: 'PRO8L3M Instrumentals cover',
    },
  }),
  gallery({
    id: 'piesni-wspolczesne-tom-ii',
    label: 'Pieśni współczesne tom II',
    category: 'book',
    cover: {
      kind: 'image',
      src: `/images/projects/piesni-wspolczesne-tom-ii/cover/piesni-album.png${V}`,
      alt: 'Pieśni współczesne tom II cover',
    },
  }),
  gallery({
    id: 'sr006-tonik-speedrun',
    label: 'SR006 — Tonik Speedrun',
    category: 'website',
    cover: {
      kind: 'image',
      src: `/images/projects/sr006-tonik-speedrun/cover/sr006.png${V}`,
      alt: 'SR006 Tonik Speedrun cover',
    },
  }),
  gallery({
    id: 'grailpoint-stay-fly',
    label: 'Grailpoint — Stay Fly',
    category: 'art direction',
    cover: {
      kind: 'image',
      src: `/images/projects/grailpoint-stay-fly/cover/stay-fly.png${V}`,
      alt: 'Grailpoint Stay Fly cover',
    },
  }),
  gallery({
    id: 'soon',
    label: 'Soon',
    category: 'art direction',
    cover: {
      kind: 'image',
      src: `/images/projects/soon/cover/soon-2.png${V}`,
      alt: 'Soon cover',
    },
  }),
  gallery({
    id: 'iconic',
    label: 'Iconic',
    category: 'website',
    cover: {
      kind: 'image',
      src: `/images/projects/iconic/cover/iconic-cover.webp${V}`,
      alt: 'Iconic cover',
    },
  }),
  gallery({
    id: 'dawid-podsiadlo-cover',
    label: 'Dawid Podsiadło — cover',
    category: 'art direction',
    cover: {
      kind: 'image',
      src: `/images/projects/dawid-podsiadlo-cover/cover/Frame%2058.png${V}`,
      alt: 'Dawid Podsiadło cover art',
    },
  }),
  gallery({
    id: 'a16z-alpha',
    label: 'a16z Alpha',
    category: 'website',
    cover: {
      kind: 'image',
      src: `/images/projects/a16z-alpha/cover/a16z-alpha.png${V}`,
      alt: 'a16z Alpha cover',
    },
  }),
  gallery({
    id: 'merrell-photoshoot',
    label: 'Merrell photoshoot',
    category: 'photography',
    cover: {
      kind: 'image',
      src: `/images/projects/merrell-photoshoot/cover/merrell.png${V}`,
      alt: 'Merrell photoshoot cover',
    },
  }),
  gallery({
    id: 'sr005-tonik-speedrun',
    label: 'SR005 — Tonik Speedrun',
    category: 'website',
    cover: {
      kind: 'image',
      src: `/images/projects/sr005-tonik-speedrun/cover/sr005.png${V}`,
      alt: 'SR005 Tonik Speedrun cover',
    },
    gallery: [
      {
        kind: 'video',
        src: `/images/projects/sr005-tonik-speedrun/video/Tonik%20SR005%20Full%20Video.mp4${V}`,
        poster: `/images/projects/sr005-tonik-speedrun/cover/sr005.png${V}`,
      },
    ],
  }),
  gallery({
    id: 'shadow',
    label: 'Shadow',
    category: 'website',
    cover: {
      kind: 'image',
      src: `/images/projects/shadow/cover/shadow.png${V}`,
      alt: 'Shadow cover',
    },
    gallery: [
      {
        kind: 'video',
        src: `/images/projects/shadow/video/shadow-face-video.webm${V}`,
        poster: `/images/projects/shadow/cover/shadow.png${V}`,
      },
    ],
  }),
]
