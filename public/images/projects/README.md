# Project Image Drop Zone

Add your files into folders that match each project id.

Folder layout per project:
- `cover/` -> one cover image or cover video poster
- `gallery/` -> fullscreen images in display order
- `video/` -> video files used in cover/gallery

Recommended naming:
- `cover.jpg` or `cover.webp`
- `gallery-01.jpg`, `gallery-02.jpg`, `gallery-03.jpg`
- `clip-01.mp4`

Example:
- `public/images/projects/website-co/cover/cover.jpg`
- `public/images/projects/website-co/gallery/gallery-01.jpg`
- `public/images/projects/website-co/video/clip-01.mp4`

Once you add files, tell me:
1. Which project id to update
2. Which file is the cover
3. The gallery order
4. Any alt text you want

Then I will wire everything in `src/data/projects.ts`.
