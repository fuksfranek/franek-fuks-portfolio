export type Media =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'video'; src: string; poster?: string }

export type Project = {
  id: string
  /** Line under the thumbnail in the bottom slider */
  label: string
  /** Shown on the card; can match first gallery item or be a dedicated still */
  cover: Media
  /** Full-viewport assets when this project is selected */
  gallery: Media[]
  /** Shown above the title in the info panel; falls back to defaultProjectCategory */
  category?: string
  /** Side panel copy when “info” is open; falls back to defaultProjectDescription */
  description?: string
}

/** Used when a project omits `category` */
export const defaultProjectCategory = 'Web Design and No-Code Development'

/** Used when a project omits `description` (two blocks separated by a blank line → two paragraphs in UI) */
export const defaultProjectDescription =
  'This slot is ready for a longer project note: how the work was framed, what constraints shaped the outcome, and what you want a visitor to take away after scrolling the gallery. Keep sentences at a natural length so the panel reads like a short editorial caption rather than a list of features.\n\nThe main stage continues to advance through stills and clips on its own. Open the rail when you want to jump projects; the side panel is for context, credits, links, or process detail that does not need to sit on every frame.'

/* Manual cache buster appended to every asset URL. Bump this whenever assets
   are replaced in-place (same filename, new bytes) so visitors with cached
   copies refetch on next load. Vite doesn't fingerprint /public files, so a
   query string is the simplest reliable bust without renaming everything. */
const V = '?v=4'

/** When `gallery` is omitted or empty, the stage shows the cover only; when listed, the stage cycles those assets and does not include the cover. */
function gallery(project: Omit<Project, 'gallery'> & { gallery?: Media[] }): Project {
  const { gallery: g, ...rest } = project
  return {
    ...rest,
    gallery: g?.length ? g : [rest.cover],
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
      { kind: 'image', src: `/images/projects/osom-pictures/gallery/osom-pictures-asset1.webp${V}`, alt: 'OSOM Pictures asset 01' },
      { kind: 'image', src: `/images/projects/osom-pictures/gallery/osom-pictures-asset2.webp${V}`, alt: 'OSOM Pictures asset 02' },
      { kind: 'image', src: `/images/projects/osom-pictures/gallery/osom-pictures-asset3.webp${V}`, alt: 'OSOM Pictures asset 03' },
      { kind: 'image', src: `/images/projects/osom-pictures/gallery/osom-pictures-asset4.webp${V}`, alt: 'OSOM Pictures asset 04' },
      { kind: 'image', src: `/images/projects/osom-pictures/gallery/osom-pictures-asset5.webp${V}`, alt: 'OSOM Pictures asset 05' },
    ],
  }),
  gallery({
    id: 'dawid-podsiadlo-merch',
    label: 'Dawid Podsiadło — merch',
    cover: {
      kind: 'image',
      src: `/images/projects/dawid-podsiadlo-merch/cover/podsiad-merch.png${V}`,
      alt: 'Dawid Podsiadło merch',
    },
  }),
  gallery({
    id: 'one-way',
    label: 'One-way',
    description:
      'One-way follows a single direction through image, type, and rhythm so the piece reads as one continuous gesture rather than isolated frames. The work grew out of print and motion studies that were folded into a single narrative arc.\n\nColor, scale, and pacing were adjusted until each beat felt inevitable. The gallery mirrors that progression—full-screen, automatic, and meant to be watched in order as much as browsed.',
    cover: {
      kind: 'image',
      src: `/images/projects/one-way/cover/one-way.png${V}`,
      alt: 'One-way cover',
    },
    gallery: [
      { kind: 'image', src: `/images/projects/one-way/gallery/3.jpg${V}`, alt: 'One-way frame 03' },
      { kind: 'image', src: `/images/projects/one-way/gallery/5.jpg${V}`, alt: 'One-way frame 05' },
      { kind: 'image', src: `/images/projects/one-way/gallery/6.jpg${V}`, alt: 'One-way frame 06' },
      { kind: 'image', src: `/images/projects/one-way/gallery/7.jpg${V}`, alt: 'One-way frame 07' },
      { kind: 'image', src: `/images/projects/one-way/gallery/8.jpg${V}`, alt: 'One-way frame 08' },
      { kind: 'image', src: `/images/projects/one-way/gallery/9.jpg${V}`, alt: 'One-way frame 09' },
      { kind: 'image', src: `/images/projects/one-way/gallery/10.jpg${V}`, alt: 'One-way frame 10' },
      { kind: 'image', src: `/images/projects/one-way/gallery/11.jpg${V}`, alt: 'One-way frame 11' },
      { kind: 'image', src: `/images/projects/one-way/gallery/12.jpg${V}`, alt: 'One-way frame 12' },
      { kind: 'image', src: `/images/projects/one-way/gallery/Untitled-1.jpg${V}`, alt: 'One-way frame 15' },
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
    cover: {
      kind: 'image',
      src: `/images/projects/pro8l3m-instrumentals-cover/cover/Pro83m.png${V}`,
      alt: 'PRO8L3M Instrumentals cover',
    },
  }),
  gallery({
    id: 'piesni-wspolczesne-tom-ii',
    label: 'Pieśni współczesne tom II',
    cover: {
      kind: 'image',
      src: `/images/projects/piesni-wspolczesne-tom-ii/cover/piesni-album.png${V}`,
      alt: 'Pieśni współczesne tom II cover',
    },
    /* One-shot deterministic shuffle (mulberry32, seed 0x2d4f81) of asset 1..10
       so the stage cycles through the set in a fixed scrambled order. */
    gallery: [
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset4.webp${V}`, alt: 'Pieśni współczesne tom II asset 04' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset8.webp${V}`, alt: 'Pieśni współczesne tom II asset 08' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset7.webp${V}`, alt: 'Pieśni współczesne tom II asset 07' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset2.webp${V}`, alt: 'Pieśni współczesne tom II asset 02' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset5.webp${V}`, alt: 'Pieśni współczesne tom II asset 05' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset9.webp${V}`, alt: 'Pieśni współczesne tom II asset 09' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset3.webp${V}`, alt: 'Pieśni współczesne tom II asset 03' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset1.webp${V}`, alt: 'Pieśni współczesne tom II asset 01' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset6.webp${V}`, alt: 'Pieśni współczesne tom II asset 06' },
      { kind: 'image', src: `/images/projects/piesni-wspolczesne-tom-ii/gallery/piesni-asset10.webp${V}`, alt: 'Pieśni współczesne tom II asset 10' },
    ],
  }),
  gallery({
    id: 'sr006-tonik-speedrun',
    label: 'SR006 — Tonik Speedrun',
    cover: {
      kind: 'image',
      src: `/images/projects/sr006-tonik-speedrun/cover/sr006.png${V}`,
      alt: 'SR006 Tonik Speedrun cover',
    },
  }),
  gallery({
    id: 'grailpoint-stay-fly',
    label: 'Grailpoint — Stay Fly',
    cover: {
      kind: 'image',
      src: `/images/projects/grailpoint-stay-fly/cover/stay-fly.png${V}`,
      alt: 'Grailpoint Stay Fly cover',
    },
  }),
  gallery({
    id: 'soon',
    label: 'Soon',
    cover: {
      kind: 'image',
      src: `/images/projects/soon/cover/soon-2.png${V}`,
      alt: 'Soon cover',
    },
  }),
  gallery({
    id: 'iconic',
    label: 'Iconic',
    cover: {
      kind: 'image',
      src: `/images/projects/iconic/cover/iconic-cover.webp${V}`,
      alt: 'Iconic cover',
    },
  }),
  gallery({
    id: 'dawid-podsiadlo-cover',
    label: 'Dawid Podsiadło — cover',
    cover: {
      kind: 'image',
      src: `/images/projects/dawid-podsiadlo-cover/cover/Frame%2058.png${V}`,
      alt: 'Dawid Podsiadło cover art',
    },
    gallery: [
      { kind: 'image', src: `/images/projects/dawid-podsiadlo-cover/gallery/dp-cover-asset1.webp${V}`, alt: 'Dawid Podsiadło cover asset 01' },
      { kind: 'image', src: `/images/projects/dawid-podsiadlo-cover/gallery/dp-cover-asset2.webp${V}`, alt: 'Dawid Podsiadło cover asset 02' },
      { kind: 'image', src: `/images/projects/dawid-podsiadlo-cover/gallery/dp-cover-asset3.webp${V}`, alt: 'Dawid Podsiadło cover asset 03' },
    ],
  }),
  gallery({
    id: 'a16z-alpha',
    label: 'a16z Alpha',
    cover: {
      kind: 'image',
      src: `/images/projects/a16z-alpha/cover/a16z-alpha.png${V}`,
      alt: 'a16z Alpha cover',
    },
  }),
  gallery({
    id: 'merrell-photoshoot',
    label: 'Merrell photoshoot',
    cover: {
      kind: 'image',
      src: `/images/projects/merrell-photoshoot/cover/merrell.png${V}`,
      alt: 'Merrell photoshoot cover',
    },
  }),
  gallery({
    id: 'sr005-tonik-speedrun',
    label: 'SR005 — Tonik Speedrun',
    cover: {
      kind: 'image',
      src: `/images/projects/sr005-tonik-speedrun/cover/sr005.png${V}`,
      alt: 'SR005 Tonik Speedrun cover',
    },
    /* Video first (mirrors osom-pictures), then asset 1..5 shuffled
       (mulberry32, seed 0x8c41a7) → order 2,5,3,4,1. */
    gallery: [
      {
        kind: 'video',
        src: `/images/projects/sr005-tonik-speedrun/video/Tonik%20SR005%20Full%20Video.mp4${V}`,
        poster: `/images/projects/sr005-tonik-speedrun/cover/sr005.png${V}`,
      },
      { kind: 'image', src: `/images/projects/sr005-tonik-speedrun/gallery/sr005-tonik-asset2.webp${V}`, alt: 'SR005 Tonik Speedrun asset 02' },
      { kind: 'image', src: `/images/projects/sr005-tonik-speedrun/gallery/sr005-tonik-asset5.webp${V}`, alt: 'SR005 Tonik Speedrun asset 05' },
      { kind: 'image', src: `/images/projects/sr005-tonik-speedrun/gallery/sr005-tonik-asset3.webp${V}`, alt: 'SR005 Tonik Speedrun asset 03' },
      { kind: 'image', src: `/images/projects/sr005-tonik-speedrun/gallery/sr005-tonik-asset4.webp${V}`, alt: 'SR005 Tonik Speedrun asset 04' },
      { kind: 'image', src: `/images/projects/sr005-tonik-speedrun/gallery/sr005-tonik-asset1.webp${V}`, alt: 'SR005 Tonik Speedrun asset 01' },
    ],
  }),
  gallery({
    id: 'shadow',
    label: 'Shadow',
    cover: {
      kind: 'image',
      src: `/images/projects/shadow/cover/shadow.png${V}`,
      alt: 'Shadow cover',
    },
    gallery: [
      { kind: 'image', src: `/images/projects/shadow/gallery/shadow-1.jpg${V}`, alt: 'Shadow frame 01' },
      { kind: 'image', src: `/images/projects/shadow/gallery/shadow-3.jpg${V}`, alt: 'Shadow frame 02' },
      {
        kind: 'video',
        src: `/images/projects/shadow/video/shadow-face-video.webm${V}`,
        poster: `/images/projects/shadow/cover/shadow.png${V}`,
      },
      { kind: 'image', src: `/images/projects/shadow/gallery/shadow-4.jpg${V}`, alt: 'Shadow frame 03' },
      {
        kind: 'video',
        src: `/images/projects/shadow/video/shadow-text-video.webm${V}`,
        poster: `/images/projects/shadow/cover/shadow.png${V}`,
      },
      { kind: 'image', src: `/images/projects/shadow/gallery/shadow-5.jpg${V}`, alt: 'Shadow frame 04' },
      {
        kind: 'video',
        src: `/images/projects/shadow/video/shadow-full-website-scroll.webm${V}`,
        poster: `/images/projects/shadow/cover/shadow.png${V}`,
      },
      { kind: 'image', src: `/images/projects/shadow/gallery/shadow-6.jpg${V}`, alt: 'Shadow frame 05' },
    ],
  }),
]
