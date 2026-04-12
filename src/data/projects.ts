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

/** When `gallery` is omitted or empty, the stage shows the cover only; when listed, the stage cycles those assets and does not include the cover. */
function gallery(project: Omit<Project, 'gallery'> & { gallery?: Media[] }): Project {
  const { gallery: g, ...rest } = project
  return {
    ...rest,
    gallery: g?.length ? g : [rest.cover],
  }
}

/** Project order = rail order. Add `gallery` arrays when you drop files under each folder’s gallery/ (and video/). */
export const projects: Project[] = [
  gallery({
    id: 'iconic',
    label: 'Iconic',
    cover: {
      kind: 'image',
      src: '/images/projects/iconic/cover/iconic-1.png',
      alt: 'Iconic cover',
    },
  }),
  gallery({
    id: 'grailpoint-stay-fly',
    label: 'Grailpoint — Stay Fly',
    cover: {
      kind: 'image',
      src: '/images/projects/grailpoint-stay-fly/cover/stay-fly.png',
      alt: 'Grailpoint Stay Fly cover',
    },
  }),
  gallery({
    id: 'one-way',
    label: 'One-way',
    description:
      'One-way follows a single direction through image, type, and rhythm so the piece reads as one continuous gesture rather than isolated frames. The work grew out of print and motion studies that were folded into a single narrative arc.\n\nColor, scale, and pacing were adjusted until each beat felt inevitable. The gallery mirrors that progression—full-screen, automatic, and meant to be watched in order as much as browsed.',
    cover: {
      kind: 'image',
      src: '/images/projects/one-way/cover/one-way.png',
      alt: 'One-way cover',
    },
    gallery: [
      { kind: 'image', src: '/images/projects/one-way/gallery/1.jpg', alt: 'One-way frame 01' },
      { kind: 'image', src: '/images/projects/one-way/gallery/3.jpg', alt: 'One-way frame 03' },
      { kind: 'image', src: '/images/projects/one-way/gallery/4.jpg', alt: 'One-way frame 04' },
      { kind: 'image', src: '/images/projects/one-way/gallery/5.jpg', alt: 'One-way frame 05' },
      { kind: 'image', src: '/images/projects/one-way/gallery/6.jpg', alt: 'One-way frame 06' },
      { kind: 'image', src: '/images/projects/one-way/gallery/7.jpg', alt: 'One-way frame 07' },
      { kind: 'image', src: '/images/projects/one-way/gallery/8.jpg', alt: 'One-way frame 08' },
      { kind: 'image', src: '/images/projects/one-way/gallery/9.jpg', alt: 'One-way frame 09' },
      { kind: 'image', src: '/images/projects/one-way/gallery/10.jpg', alt: 'One-way frame 10' },
      { kind: 'image', src: '/images/projects/one-way/gallery/11.jpg', alt: 'One-way frame 11' },
      { kind: 'image', src: '/images/projects/one-way/gallery/12.jpg', alt: 'One-way frame 12' },
      { kind: 'image', src: '/images/projects/one-way/gallery/13.jpg', alt: 'One-way frame 13' },
      { kind: 'image', src: '/images/projects/one-way/gallery/14.jpg', alt: 'One-way frame 14' },
      { kind: 'image', src: '/images/projects/one-way/gallery/Untitled-1.jpg', alt: 'One-way frame 15' },
      {
        kind: 'video',
        src: '/images/projects/one-way/video/Screen%20Recording%202025-06-21%20at%2021.00.10.mov',
        poster: '/images/projects/one-way/cover/one-way.png',
      },
    ],
  }),
  gallery({
    id: 'merrell-photoshoot',
    label: 'Merrell photoshoot',
    cover: {
      kind: 'image',
      src: '/images/projects/merrell-photoshoot/cover/merrell.png',
      alt: 'Merrell photoshoot cover',
    },
  }),
  gallery({
    id: 'a16z-alpha',
    label: 'a16z Alpha',
    cover: {
      kind: 'image',
      src: '/images/projects/a16z-alpha/cover/a16z-alpha.png?v=2',
      alt: 'a16z Alpha cover',
    },
  }),
  gallery({
    id: 'shadow',
    label: 'Shadow',
    cover: {
      kind: 'image',
      src: '/images/projects/shadow/cover/shadow.png?v=2',
      alt: 'Shadow cover',
    },
    gallery: [
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-1.jpg', alt: 'Shadow frame 01' },
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-2.jpg', alt: 'Shadow frame 02' },
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-3.jpg', alt: 'Shadow frame 03' },
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-4.jpg', alt: 'Shadow frame 04' },
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-5.jpg', alt: 'Shadow frame 05' },
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-6.jpg', alt: 'Shadow frame 06' },
      { kind: 'image', src: '/images/projects/shadow/gallery/shadow-7.jpg', alt: 'Shadow frame 07' },
    ],
  }),
  gallery({
    id: 'dawid-podsiadlo-cover',
    label: 'Dawid Podsiadło — cover',
    cover: {
      kind: 'image',
      src: '/images/projects/dawid-podsiadlo-cover/cover/Frame%2058.png',
      alt: 'Dawid Podsiadło cover art',
    },
  }),
  gallery({
    id: 'dawid-podsiadlo-merch',
    label: 'Dawid Podsiadło — merch',
    cover: {
      kind: 'image',
      src: '/images/projects/dawid-podsiadlo-merch/cover/podsiad-merch.png',
      alt: 'Dawid Podsiadło merch',
    },
  }),
  gallery({
    id: 'osom-pictures',
    label: 'OSOM Pictures',
    cover: {
      kind: 'image',
      src: '/images/projects/osom-pictures/cover/pictures.png',
      alt: 'OSOM Pictures cover',
    },
  }),
  gallery({
    id: 'piesni-wspolczesne-tom-ii',
    label: 'Pieśni współczesne tom II',
    cover: {
      kind: 'image',
      src: '/images/projects/piesni-wspolczesne-tom-ii/cover/piesni-album.png',
      alt: 'Pieśni współczesne tom II cover',
    },
  }),
  gallery({
    id: 'pro8l3m-instrumentals-cover',
    label: 'PRO8L3M Instrumentals',
    cover: {
      kind: 'image',
      src: '/images/projects/pro8l3m-instrumentals-cover/cover/Pro83m.png',
      alt: 'PRO8L3M Instrumentals cover',
    },
  }),
  gallery({
    id: 'soon',
    label: 'Soon',
    cover: {
      kind: 'image',
      src: '/images/projects/soon/cover/soon-2.png',
      alt: 'Soon cover',
    },
  }),
  gallery({
    id: 'sr005-tonik-speedrun',
    label: 'SR005 — Tonik Speedrun',
    cover: {
      kind: 'image',
      src: '/images/projects/sr005-tonik-speedrun/cover/sr005.png?v=3',
      alt: 'SR005 Tonik Speedrun cover',
    },
  }),
  gallery({
    id: 'sr006-tonik-speedrun',
    label: 'SR006 — Tonik Speedrun',
    cover: {
      kind: 'image',
      src: '/images/projects/sr006-tonik-speedrun/cover/sr006.png?v=3',
      alt: 'SR006 Tonik Speedrun cover',
    },
  }),
]
