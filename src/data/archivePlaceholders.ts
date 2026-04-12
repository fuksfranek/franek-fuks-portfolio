export type ArchiveItem = {
  id: string
  color: string
  aspectW: number
  aspectH: number
}

/** First three match `ArchiveTeaser` stack (FLIP continuity). */
export const ARCHIVE_TEASER_COLORS = ['#c75c7a', '#3d8b84', '#6b5bb8'] as const

const extraColors = [
  '#e8a849',
  '#4a7cc7',
  '#8f6b4a',
  '#2d6a4f',
  '#c94b4b',
  '#5c4d7a',
  '#d4896c',
  '#3d5a80',
  '#9c6644',
  '#6a994e',
  '#bc4b91',
  '#457b9d',
  '#e76f51',
  '#264653',
  '#8338ec',
  '#ff006e',
  '#3a86ff',
  '#fb5607',
  '#ffbe0b',
  '#2ec4b6',
  '#cbf3f0',
  '#5e503f',
]

const ratios: readonly [number, number][] = [
  [4, 5],
  [3, 4],
  [16, 9],
  [1, 1],
  [2, 3],
  [5, 4],
  [4, 3],
  [9, 16],
  [3, 2],
  [1, 2],
  [5, 7],
  [7, 5],
  [11, 8],
  [8, 11],
  [6, 5],
  [5, 6],
  [14, 9],
  [9, 14],
  [5, 8],
  [8, 5],
  [10, 7],
  [7, 10],
  [12, 7],
  [7, 12],
  [3, 5],
]

function buildItems(): ArchiveItem[] {
  const items: ArchiveItem[] = ARCHIVE_TEASER_COLORS.map((color, i) => ({
    id: `archive-${i + 1}`,
    color,
    aspectW: ratios[i]![0],
    aspectH: ratios[i]![1],
  }))
  for (let i = 3; i < 25; i += 1) {
    items.push({
      id: `archive-${i + 1}`,
      color: extraColors[i - 3] ?? '#6c757d',
      aspectW: ratios[i]![0],
      aspectH: ratios[i]![1],
    })
  }
  return items
}

export const archiveItems: ArchiveItem[] = buildItems()
