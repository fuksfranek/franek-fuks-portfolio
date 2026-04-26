# Portfolio Content

Editable portfolio content lives here. The React app still imports typed data from
`src/data/projects.ts` and `src/data/archivePlaceholders.ts`, but those files now
normalize this JSON instead of storing the content directly.

## Projects

Each file in `content/projects/` is one project. `order` controls the rail order.

Common fields:

- `label`: project title shown in the rail, header, and info panel.
- `category`: one of `merch`, `website`, `book`, `art direction`, `photography`.
- `description`: optional info-panel copy. Use `\n\n` between paragraphs.
- `cover`: media used for the bottom rail card.
- `gallery`: up to ten project-view assets, in playback order.

Cover media is not injected into the project gallery. Add every project-view
asset explicitly in `gallery`, even if it visually matches the cover.

Media can be full-bleed:

```json
{
  "kind": "image",
  "src": "/images/projects/example/gallery/gallery-01.webp",
  "alt": "Example still",
  "presentation": {
    "mode": "fill",
    "objectPosition": "center"
  }
}
```

Or framed:

```json
{
  "kind": "video",
  "src": "/images/projects/example/video/demo.mp4",
  "poster": "/images/projects/example/posters/demo.webp",
  "presentation": {
    "mode": "framed",
    "background": { "kind": "color", "value": "#f3eadf" },
    "padding": "clamp(2rem, 7vw, 6.5rem)",
    "mediaFit": "contain",
    "objectPosition": "center",
    "shadow": "soft"
  }
}
```

For framed media, `background` can also be an image:

```json
{
  "kind": "image",
  "src": "/images/projects/example/backgrounds/blurred.webp",
  "fit": "cover",
  "position": "center"
}
```

## Archive

`content/archive.json` controls the archive grid.

- `items`: archive media in display order.
- `aspectW` and `aspectH`: real media dimensions used to lay out masonry before load.
- `aboveFoldCount`: how many archive items are preloaded at high priority.
- `teaserItemIds`: explicit items for the rail teaser stack.

When replacing a file in place, keep dimensions accurate and update alt text at the
same time. If project assets are replaced without changing filenames, bump `V` in
`src/data/projects.ts` so browsers refetch the new files.
