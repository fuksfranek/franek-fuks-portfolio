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

type Source = {
  file: string
  w: number
  h: number
  kind?: ArchiveItemKind
  poster?: string
}

/* Real image / video dimensions (sips + mdls); drives aspectRatio so the
   masonry lays out before the bytes land.

   Order is a one-shot deterministic shuffle (mulberry32, seed 0x1f8a3c) of
   the raw 31 stills + 6 motion clips, baked in here so the layout is
   reproducible across reloads. To re-roll, change the seed in tools or
   hand-edit this list. */
const sources: readonly Source[] = [
  { file: 'archive-item20.webp', w: 550, h: 604 },
  { file: 'archive-video-5.mp4', w: 1080, h: 1080, kind: 'video' },
  { file: 'archive-item1.webp', w: 2048, h: 2560 },
  { file: 'archive-item6.webp', w: 1892, h: 1600 },
  { file: 'archive-item27.webp', w: 3024, h: 4032 },
  { file: 'archive-item26.webp', w: 3024, h: 4032 },
  { file: 'archive-video-6.mp4', w: 1080, h: 1350, kind: 'video' },
  { file: 'archive-item3.webp', w: 1440, h: 1799 },
  { file: 'archive-item19.webp', w: 850, h: 530 },
  { file: 'archive-item15.webp', w: 3024, h: 4032 },
  { file: 'archive-video-7.mp4', w: 1548, h: 1080, kind: 'video' },
  { file: 'archive-video-3.mp4', w: 1612, h: 1080, kind: 'video' },
  { file: 'archive-item5.webp', w: 3024, h: 4032 },
  { file: 'archive-item8.webp', w: 754, h: 806 },
  { file: 'archive-item12.webp', w: 1440, h: 1440 },
  { file: 'archive-item29.webp', w: 1440, h: 1799 },
  { file: 'archive-item25.webp', w: 3024, h: 4032 },
  { file: 'archive-item13.webp', w: 1179, h: 2556 },
  { file: 'archive-item2.webp', w: 1080, h: 1350 },
  { file: 'archive-item21.webp', w: 409, h: 322 },
  { file: 'archive-video-2.mp4', w: 1080, h: 1080, kind: 'video' },
  { file: 'archive-item11.webp', w: 1440, h: 1800 },
  { file: 'archive-item24.webp', w: 3024, h: 4032 },
  { file: 'archive-item28.webp', w: 3024, h: 4032 },
  { file: 'archive-item22.webp', w: 1435, h: 1104 },
  { file: 'archive-item7.webp', w: 1276, h: 924 },
  { file: 'archive-item14.webp', w: 3024, h: 4032 },
  { file: 'archive-item4.webp', w: 2160, h: 2160 },
  { file: 'archive-item23.webp', w: 836, h: 1157 },
  { file: 'archive-item30.webp', w: 1440, h: 1800 },
  { file: 'archive-item10.webp', w: 1080, h: 1350 },
  { file: 'archive-item17.webp', w: 1051, h: 828 },
  { file: 'archive-video-4.mp4', w: 1612, h: 1080, kind: 'video' },
  { file: 'archive-item31.webp', w: 1179, h: 2096 },
  { file: 'archive-item16.webp', w: 3024, h: 4032 },
  { file: 'archive-item18.webp', w: 3240, h: 3240 },
  { file: 'archive-item9.webp', w: 2160, h: 2700 },
]

export const archiveItems: ArchiveItem[] = sources.map((s, i) => ({
  id: `archive-${i + 1}`,
  src: `/images/archive/${s.file}`,
  alt: `Archive ${i + 1}`,
  aspectW: s.w,
  aspectH: s.h,
  kind: s.kind ?? 'image',
  poster: s.poster,
}))
