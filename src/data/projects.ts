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
}

function gallery(project: Omit<Project, 'gallery'> & { gallery?: Media[] }): Project {
  const { gallery: g, ...rest } = project
  return {
    ...rest,
    gallery: g?.length ? g : [rest.cover],
  }
}

/** Replace URLs and labels with your real projects; add/remove entries as needed */
export const projects: Project[] = [
  gallery({
    id: 'website-co',
    label: 'Website for Company',
    cover: {
      kind: 'image',
      src: 'https://picsum.photos/seed/website/800/500',
      alt: 'Website project cover',
    },
    gallery: [
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/w1/1920/1080',
        alt: 'Website screenshot 1',
      },
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/w2/1920/1080',
        alt: 'Website screenshot 2',
      },
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/w3/1920/1080',
        alt: 'Website screenshot 3',
      },
    ],
  }),
  gallery({
    id: 'book-wojtek',
    label: 'Book for Wojtek Koziara',
    cover: {
      kind: 'image',
      src: 'https://picsum.photos/seed/bookcover/600/800',
      alt: 'Book project cover',
    },
    gallery: [
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/b1/1600/1200',
        alt: 'Book spread 1',
      },
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/b2/1600/1200',
        alt: 'Book spread 2',
      },
    ],
  }),
  gallery({
    id: 'motion-piece',
    label: 'Motion study',
    cover: {
      kind: 'video',
      src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      poster: 'https://picsum.photos/seed/mcover/800/450',
    },
    gallery: [
      {
        kind: 'video',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        poster: 'https://picsum.photos/seed/m1/1920/1080',
      },
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/m2/1920/1080',
        alt: 'Motion project still',
      },
    ],
  }),
  gallery({
    id: 'single-photo',
    label: 'Single-image project',
    cover: {
      kind: 'image',
      src: 'https://picsum.photos/seed/single/640/640',
      alt: 'Single image cover',
    },
    gallery: [
      {
        kind: 'image',
        src: 'https://picsum.photos/seed/single/1920/1080',
        alt: 'Only fullscreen asset',
      },
    ],
  }),
  gallery({
    id: 'brand-refresh',
    label: 'Brand refresh toolkit',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/br5/720/480', alt: 'Brand refresh cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/br5a/1920/1080', alt: 'Brand 1' },
      { kind: 'image', src: 'https://picsum.photos/seed/br5b/1920/1080', alt: 'Brand 2' },
    ],
  }),
  gallery({
    id: 'editorial-zine',
    label: 'Editorial zine, issue 04',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/zine6/600/900', alt: 'Zine cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/z6a/1600/1200', alt: 'Spread A' },
      { kind: 'image', src: 'https://picsum.photos/seed/z6b/1600/1200', alt: 'Spread B' },
      { kind: 'image', src: 'https://picsum.photos/seed/z6c/1600/1200', alt: 'Spread C' },
    ],
  }),
  gallery({
    id: 'packaging-line',
    label: 'Packaging line exploration',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/pack7/800/600', alt: 'Packaging cover' },
    gallery: [{ kind: 'image', src: 'https://picsum.photos/seed/p7full/1920/1080', alt: 'Packaging hero' }],
  }),
  gallery({
    id: 'signage-system',
    label: 'Wayfinding & signage',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/sign8/700/500', alt: 'Signage cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/s8a/1920/1080', alt: 'Sign 1' },
      { kind: 'image', src: 'https://picsum.photos/seed/s8b/1920/1080', alt: 'Sign 2' },
    ],
  }),
  gallery({
    id: 'photo-series-ruins',
    label: 'Photo series: ruins',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/ruin9/900/600', alt: 'Ruins cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/r9a/1920/1280', alt: 'Ruin A' },
      { kind: 'image', src: 'https://picsum.photos/seed/r9b/1920/1280', alt: 'Ruin B' },
      { kind: 'image', src: 'https://picsum.photos/seed/r9c/1920/1280', alt: 'Ruin C' },
      { kind: 'image', src: 'https://picsum.photos/seed/r9d/1920/1280', alt: 'Ruin D' },
    ],
  }),
  gallery({
    id: 'title-sequence',
    label: 'Short film title sequence',
    cover: {
      kind: 'video',
      src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      poster: 'https://picsum.photos/seed/tseq10/800/450',
    },
    gallery: [
      {
        kind: 'video',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        poster: 'https://picsum.photos/seed/t10v/1920/1080',
      },
      { kind: 'image', src: 'https://picsum.photos/seed/t10s/1920/1080', alt: 'Style frame' },
    ],
  }),
  gallery({
    id: 'conference-slides',
    label: 'Conference talk slides',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/talk11/760/480', alt: 'Slides cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/tk11a/1920/1080', alt: 'Slide A' },
      { kind: 'image', src: 'https://picsum.photos/seed/tk11b/1920/1080', alt: 'Slide B' },
    ],
  }),
  gallery({
    id: 'album-art',
    label: 'Album artwork',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/alb12/640/640', alt: 'Album cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/a12a/1600/1600', alt: 'Art A' },
      { kind: 'image', src: 'https://picsum.photos/seed/a12b/1600/1600', alt: 'Art B' },
    ],
  }),
  gallery({
    id: 'mobile-app-ui',
    label: 'Mobile app UI concepts',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/mob13/700/1200', alt: 'App UI cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/m13a/1080/1920', alt: 'Screen A' },
      { kind: 'image', src: 'https://picsum.photos/seed/m13b/1080/1920', alt: 'Screen B' },
      { kind: 'image', src: 'https://picsum.photos/seed/m13c/1080/1920', alt: 'Screen C' },
    ],
  }),
  gallery({
    id: 'window-display',
    label: 'Retail window display',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/win14/820/520', alt: 'Window display cover' },
    gallery: [{ kind: 'image', src: 'https://picsum.photos/seed/w14f/1920/1080', alt: 'Display photo' }],
  }),
  gallery({
    id: 'annual-report',
    label: 'Annual report layout',
    cover: { kind: 'image', src: 'https://picsum.photos/seed/ar15/780/540', alt: 'Report cover' },
    gallery: [
      { kind: 'image', src: 'https://picsum.photos/seed/ar15a/1920/1080', alt: 'Spread 1' },
      { kind: 'image', src: 'https://picsum.photos/seed/ar15b/1920/1080', alt: 'Spread 2' },
      { kind: 'image', src: 'https://picsum.photos/seed/ar15c/1920/1080', alt: 'Spread 3' },
    ],
  }),
]
