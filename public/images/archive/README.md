# Archive Drop Zone

Dump every archive image or video into this folder. The masonry grid is wired
from `content/archive.json`.

## Layout

Flat folder, one file per tile:

- `public/images/archive/`
  - `01-<short-name>.jpg`
  - `02-<short-name>.jpg`
  - …
  - `25-<short-name>.jpg`

## Naming

- Prefix with two-digit display order: `01-`, `02-`, … `25-`
- Use a short kebab-case name after the prefix (`01-poster-stutter.jpg`)
- Prefer `.jpg` for photos, `.webp` for synthetic art, `.png` only when transparency matters
- Keep the longest edge at ≤ 2400 px (the masonry caps display width well under this)

## Aspect ratios

The grid is a Pinterest-style masonry — any aspect works. If you want a specific tile to land in a specific column, mention it when handing off.

## Once you've dumped files, update

1. Display order in `content/archive.json`
2. Alt text per item
3. `aspectW` and `aspectH` using the real media dimensions
4. `teaserItemIds` for the rail teaser stack
5. `aboveFoldCount` if the preload cutoff should change

`src/data/archivePlaceholders.ts` now only normalizes that content file for the
app. Teaser picks are explicit IDs, so reordering the archive no longer changes
the rail teaser by accident.
