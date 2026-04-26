import type { ContentProject, Media, MediaBackground, MediaPresentation, Project } from './contentSchema'
import { normalizeProjects } from './contentSchema'

export type { Media, MediaBackground, MediaPresentation, Project }

/** Used when a project omits `description` */
export const defaultProjectDescription =
  'A compact note for selected work, giving just enough context to frame the images while keeping the gallery as the main story.'

/* Manual cache buster appended to every asset URL. Bump this whenever assets
   are replaced in-place (same filename, new bytes) so visitors with cached
   copies refetch on next load. Vite doesn't fingerprint /public files, so a
   query string is the simplest reliable bust without renaming everything. */
const V = '?v=4'

/* ────────────────────────────────────────────────────────────
 * Project order = rail order. Each JSON file stores an `order` value from the
 * current deterministic shuffle so the rail stays consistent across reloads.
 * ──────────────────────────────────────────────────────────── */
const projectModules = import.meta.glob<ContentProject>('../../content/projects/*.json', {
  eager: true,
  import: 'default',
})

export const projects: Project[] = normalizeProjects(Object.values(projectModules), V)
