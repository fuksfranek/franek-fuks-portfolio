# Archive Drop Zone

Dump every archive image into this folder. The masonry grid currently shows 25 colored placeholders (`src/data/archivePlaceholders.ts`) — once files are here I'll wire them in.

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

## Once you've dumped files, tell me

1. Display order (or "use filename order")
2. Optional alt text per image (or "skip alt")
3. Which three should be the teaser stack on the rail (currently the first three colors)
4. Any image you want as a featured/hero tile

Then I'll replace `archivePlaceholders.ts` with real entries and swap the colored swatches for `<img>` tags in the masonry + lightbox.
