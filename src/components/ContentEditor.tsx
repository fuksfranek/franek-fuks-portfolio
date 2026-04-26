import { useEffect, useMemo, useState } from 'react'
import type {
  ArchiveContent,
  ContentProject,
  Media,
  MediaBackground,
  MediaPresentation,
} from '../data/contentSchema'
import { defaultProjectDescription } from '../data/projects'
import './ContentEditor.css'

const projectModules = import.meta.glob<ContentProject>('../../content/projects/*.json', {
  eager: true,
  import: 'default',
})

const archiveModules = import.meta.glob<ArchiveContent>('../../content/archive.json', {
  eager: true,
  import: 'default',
})

type UploadTarget = 'cover' | 'gallery' | 'video' | 'posters' | 'backgrounds' | 'archive'

function initialProjects() {
  return Object.values(projectModules).sort((a, b) => a.order - b.order)
}

function initialArchive() {
  return Object.values(archiveModules)[0]
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function uploadContentFile(file: File, target: UploadTarget, projectId?: string) {
  const params = new URLSearchParams({
    target,
    filename: file.name,
  })
  if (projectId) params.set('projectId', projectId)

  const response = await fetch(`/__content/upload?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  const data = (await response.json().catch(() => null)) as { src?: string; error?: string } | null
  if (!response.ok || !data?.src) {
    throw new Error(data?.error ?? 'Upload failed.')
  }
  return data.src
}

function readMediaDimensions(file: File) {
  return new Promise<{ aspectW: number; aspectH: number; kind: 'image' | 'video' }>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const done = (value: { aspectW: number; aspectH: number; kind: 'image' | 'video' }) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    const fail = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read media dimensions.'))
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () =>
        done({ aspectW: video.videoWidth || 1, aspectH: video.videoHeight || 1, kind: 'video' })
      video.onerror = fail
      video.src = url
      return
    }

    const image = new Image()
    image.onload = () => done({ aspectW: image.naturalWidth || 1, aspectH: image.naturalHeight || 1, kind: 'image' })
    image.onerror = fail
    image.src = url
  })
}

function fileNameFromPath(src: string) {
  return decodeURIComponent(src.split('/').pop() ?? src)
}

function mediaLabel(media: Media, index: number) {
  const name = media.kind === 'image' ? media.alt || fileNameFromPath(media.src) : media.poster ?? media.src
  return name || `Asset ${index + 1}`
}

function emptyImage(): Media {
  return {
    kind: 'image',
    src: '',
    alt: '',
    presentation: { mode: 'fill', objectPosition: 'center' },
  }
}

function presentationMode(presentation: MediaPresentation | undefined) {
  return presentation?.mode === 'framed' ? 'framed' : 'fill'
}

function defaultFramedPresentation(): MediaPresentation {
  return {
    mode: 'framed',
    background: { kind: 'color', value: '#f3eadf' },
    padding: 'clamp(2rem, 7vw, 6.5rem)',
    mediaFit: 'contain',
    objectPosition: 'center',
    shadow: 'soft',
  }
}

function updateMediaPresentation(media: Media, nextMode: 'fill' | 'framed'): Media {
  return {
    ...media,
    presentation:
      nextMode === 'framed'
        ? defaultFramedPresentation()
        : { mode: 'fill', objectPosition: media.presentation?.objectPosition ?? 'center' },
  }
}

function backgroundValue(background: MediaBackground | undefined) {
  if (!background) return ''
  return background.kind === 'color' ? background.value : background.src
}

type PreviewProps = {
  media: Media
  label: string
  category?: string
  description?: string
}

function Preview({ media, label, category, description }: PreviewProps) {
  const mode = presentationMode(media.presentation)
  const framed = media.presentation?.mode === 'framed' ? media.presentation : undefined
  const background = framed?.background
  const hasSrc = media.src.trim().length > 0
  const previewDescription = description?.trim()
  const previewCategory = category?.trim()
  const showProjectMeta = Boolean(previewDescription || previewCategory)
  const style =
    background?.kind === 'color'
      ? { background: background.value }
      : background?.kind === 'image'
        ? {
            backgroundImage: `url("${background.src}")`,
            backgroundSize: background.fit ?? 'cover',
            backgroundPosition: background.position ?? 'center',
          }
        : undefined

  return (
    <div className={`contentEditorPreview contentEditorPreview--${mode}`} style={style}>
      <div className="contentEditorPreviewChrome">
        <span>{label}</span>
        <span>{media.kind}</span>
        <span>{mode}</span>
      </div>
      {!hasSrc ? (
        <div className="contentEditorPreviewEmpty">
          <strong>No asset path yet</strong>
          <span>Add a path to preview this media.</span>
        </div>
      ) : media.kind === 'video' ? (
        <video
          className={`contentEditorPreviewMedia ${showProjectMeta ? 'contentEditorPreviewMedia--blurred' : ''}`}
          src={media.src}
          poster={media.poster}
          muted
          playsInline
          controls
        />
      ) : (
        <img
          className={`contentEditorPreviewMedia ${showProjectMeta ? 'contentEditorPreviewMedia--blurred' : ''}`}
          src={media.src}
          alt={media.alt}
        />
      )}
      {showProjectMeta ? (
        <div className="contentEditorPreviewMeta">
          {previewCategory ? <span className="contentEditorPreviewCategory">{previewCategory}</span> : null}
          {previewDescription ? <p>{previewDescription}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

type FieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function Field({ label, value, onChange, placeholder }: FieldProps) {
  return (
    <label className="contentEditorField">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

type UploadButtonProps = {
  label: string
  accept: string
  target: UploadTarget
  projectId?: string
  disabled?: boolean
  onUploaded: (src: string, file: File) => void | Promise<void>
  onStatus: (message: string) => void
}

function UploadButton({ label, accept, target, projectId, disabled, onUploaded, onStatus }: UploadButtonProps) {
  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return
    try {
      onStatus(`Uploading ${file.name}...`)
      const src = await uploadContentFile(file, target, projectId)
      await onUploaded(src, file)
      onStatus(`Added ${fileNameFromPath(src)}`)
    } catch (error) {
      onStatus(error instanceof Error ? error.message : 'Upload failed.')
    }
  }

  return (
    <label className={`contentEditorUploadButton ${disabled ? 'contentEditorUploadButton--disabled' : ''}`}>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          void handleFile(e.target.files?.[0])
          e.currentTarget.value = ''
        }}
      />
      <span>{label}</span>
    </label>
  )
}

export function ContentEditor() {
  const [projects, setProjects] = useState<ContentProject[]>(initialProjects)
  const [archive, setArchive] = useState<ArchiveContent | undefined>(initialArchive)
  const [selectedId, setSelectedId] = useState(() => initialProjects()[0]?.id ?? '')
  const [assetIndex, setAssetIndex] = useState(0)
  const [lastExport, setLastExport] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')

  useEffect(() => {
    document.body.classList.add('contentEditorBody')
    return () => document.body.classList.remove('contentEditorBody')
  }, [])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? projects[0],
    [projects, selectedId],
  )

  const gallery = selectedProject?.gallery ?? []
  const selectedMedia = gallery[assetIndex] ?? null
  const previewMedia = selectedMedia ?? selectedProject?.cover

  const updateSelectedProject = (update: (project: ContentProject) => ContentProject) => {
    if (!selectedProject) return
    setProjects((current) =>
      current.map((project) => (project.id === selectedProject.id ? update(project) : project)),
    )
  }

  const updateGalleryMedia = (index: number, update: (media: Media) => Media) => {
    updateSelectedProject((project) => {
      const gallery = [...(project.gallery ?? [])]
      gallery[index] = update(gallery[index] ?? emptyImage())
      return { ...project, gallery }
    })
  }

  const removeGalleryMedia = (index: number) => {
    updateSelectedProject((project) => {
      const gallery = [...(project.gallery ?? [])]
      gallery.splice(index, 1)
      return { ...project, gallery }
    })
    setAssetIndex((current) => Math.max(0, Math.min(current, index - 1)))
  }

  const moveGalleryMedia = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= gallery.length) return
    updateSelectedProject((project) => {
      const gallery = [...(project.gallery ?? [])]
      const current = gallery[index]
      const next = gallery[nextIndex]
      if (!current || !next) return project
      gallery[index] = next
      gallery[nextIndex] = current
      return { ...project, gallery }
    })
    setAssetIndex(nextIndex)
  }

  const exportJson = (filename: string, value: unknown) => {
    downloadJson(filename, value)
    setLastExport(filename)
  }

  const addArchiveUpload = async (src: string, file: File) => {
    const dimensions = await readMediaDimensions(file)
    setArchive((current) => {
      if (!current) return current
      const nextIndex = current.items.length + 1
      return {
        ...current,
        items: [
          ...current.items,
          {
            id: `archive-${nextIndex}`,
            file: fileNameFromPath(src),
            alt: `Archive ${nextIndex}`,
            ...dimensions,
          },
        ],
      }
    })
  }

  const addGalleryUpload = (src: string, file: File, kind: 'image' | 'video') => {
    updateSelectedProject((project) => {
      const next: Media =
        kind === 'image'
          ? {
              kind: 'image',
              src,
              alt: fileNameFromPath(file.name),
              presentation: { mode: 'fill', objectPosition: 'center' },
            }
          : {
              kind: 'video',
              src,
              presentation: { mode: 'fill', objectPosition: 'center' },
            }
      const gallery = [...(project.gallery ?? []), next]
      return { ...project, gallery }
    })
    setAssetIndex(gallery.length)
  }

  if (!selectedProject || !previewMedia) {
    return <main className="contentEditor">No content files found.</main>
  }

  return (
    <main className="contentEditor">
      <div className="contentEditorLayout">
        <aside className="contentEditorSidebar" aria-label="Projects">
          <div className="contentEditorSidebarHead">
            <strong>Content</strong>
            <span>{projects.length} projects</span>
          </div>
          <div className="contentEditorProjectList">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={project.id === selectedProject.id ? 'contentEditorProject--active' : ''}
                onClick={() => {
                  setSelectedId(project.id)
                  setAssetIndex(0)
                }}
              >
                <span>{project.label}</span>
                <small>{project.category}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="contentEditorWorkspace" aria-label="Content editor">
          <div className="contentEditorMain">
            <section className="contentEditorBlock">
              <div className="contentEditorBlockHead">
                <h1>Project details</h1>
                <span>{selectedProject.id}</span>
              </div>
              <div className="contentEditorGrid">
            <Field
              label="Title"
              value={selectedProject.label}
              onChange={(label) => updateSelectedProject((project) => ({ ...project, label }))}
            />
            <Field
              label="Category"
              value={selectedProject.category}
              placeholder="art direction"
              onChange={(category) => updateSelectedProject((project) => ({ ...project, category }))}
            />
            <label className="contentEditorField contentEditorField--wide">
              <span>Description</span>
              <textarea
                value={selectedProject.description ?? ''}
                onChange={(e) =>
                  updateSelectedProject((project) => ({ ...project, description: e.target.value }))
                }
              />
            </label>
              </div>
            </section>

            <section className="contentEditorBlock">
              <div className="contentEditorBlockHead contentEditorBlockHead--withAction">
              <div>
                <h2>Cover</h2>
                <span>{fileNameFromPath(selectedProject.cover.src) || 'No file selected'}</span>
              </div>
              <div className="contentEditorSectionActions">
                <UploadButton
                  label="Replace cover image"
                  accept="image/*"
                  target="cover"
                  projectId={selectedProject.id}
                  onStatus={setUploadStatus}
                  onUploaded={(src, file) =>
                    updateSelectedProject((project) => ({
                      ...project,
                      cover: {
                        kind: 'image',
                        src,
                        alt: project.cover.kind === 'image' ? project.cover.alt || fileNameFromPath(file.name) : fileNameFromPath(file.name),
                      },
                    }))
                  }
                />
              </div>
              </div>
              <div className="contentEditorGrid">
              <label className="contentEditorField">
                <span>Kind</span>
                <select
                  value={selectedProject.cover.kind}
                  onChange={(e) =>
                    updateSelectedProject((project) => ({
                      ...project,
                      cover:
                        e.target.value === 'video'
                          ? { kind: 'video', src: project.cover.src }
                          : {
                              kind: 'image',
                              src: project.cover.src,
                              alt: project.cover.kind === 'image' ? project.cover.alt : '',
                            },
                    }))
                  }
                >
                  <option value="image">image</option>
                  <option value="video">video</option>
                </select>
              </label>
              <Field
                label="Manual cover path"
                value={selectedProject.cover.src}
                onChange={(src) =>
                  updateSelectedProject((project) => ({ ...project, cover: { ...project.cover, src } }))
                }
              />
              {selectedProject.cover.kind === 'image' ? (
                <Field
                  label="Cover alt text"
                  value={selectedProject.cover.alt}
                  onChange={(alt) =>
                    updateSelectedProject((project) => ({ ...project, cover: { ...project.cover, alt } }))
                  }
                />
              ) : (
                <Field
                  label="Cover poster"
                  value={selectedProject.cover.poster ?? ''}
                  onChange={(poster) =>
                    updateSelectedProject((project) => ({ ...project, cover: { ...project.cover, poster } }))
                  }
                />
              )}
              {selectedProject.cover.kind === 'video' ? (
                <div className="contentEditorUploadSlot">
                  <span>Cover video file</span>
                  <UploadButton
                    label="Choose cover video"
                    accept="video/*"
                    target="video"
                    projectId={selectedProject.id}
                    onStatus={setUploadStatus}
                    onUploaded={(src) =>
                      updateSelectedProject((project) => ({ ...project, cover: { ...project.cover, src } }))
                    }
                  />
                </div>
              ) : null}
              {selectedProject.cover.kind === 'video' ? (
                <div className="contentEditorUploadSlot">
                  <span>Cover poster file</span>
                  <UploadButton
                    label="Choose poster"
                    accept="image/*"
                    target="posters"
                    projectId={selectedProject.id}
                    onStatus={setUploadStatus}
                    onUploaded={(poster) =>
                      updateSelectedProject((project) => ({ ...project, cover: { ...project.cover, poster } }))
                    }
                  />
                </div>
              ) : null}
              </div>
            </section>

            <section className="contentEditorBlock">
              <div className="contentEditorBlockHead contentEditorBlockHead--withAction">
                <div>
                  <h2>Assets</h2>
                  <span>{gallery.length} / 10 assets</span>
                </div>
                <div className="contentEditorSectionActions">
                  <UploadButton
                    label="Add image"
                    accept="image/*"
                    target="gallery"
                    projectId={selectedProject.id}
                    disabled={gallery.length >= 10}
                    onStatus={setUploadStatus}
                    onUploaded={(src, file) => addGalleryUpload(src, file, 'image')}
                  />
                  <UploadButton
                    label="Add video"
                    accept="video/*"
                    target="video"
                    projectId={selectedProject.id}
                    disabled={gallery.length >= 10}
                    onStatus={setUploadStatus}
                    onUploaded={(src, file) => addGalleryUpload(src, file, 'video')}
                  />
                  <button
                    type="button"
                    className="contentEditorButton--secondary"
                    disabled={gallery.length >= 10}
                    onClick={() =>
                      updateSelectedProject((project) => ({
                        ...project,
                        gallery: [...(project.gallery ?? []), emptyImage()],
                      }))
                    }
                  >
                    Manual asset
                  </button>
                </div>
              </div>

              <div className="contentEditorAssetLayout">
              {gallery.length === 0 ? (
                <div className="contentEditorEmptyCard">
                  <strong>No authored gallery assets yet</strong>
                  <span>
                    Add images or videos above. Cover media is only used for the rail card, not as a project
                    asset.
                  </span>
                </div>
              ) : (
                <div className="contentEditorAssets">
                  {gallery.map((media, index) => (
                    <button
                      key={`${media.src}-${index}`}
                      type="button"
                      className={assetIndex === index ? 'contentEditorAsset--active' : ''}
                      onClick={() => setAssetIndex(index)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <strong>{media.kind}</strong>
                      <small>{mediaLabel(media, index)}</small>
                    </button>
                  ))}
                </div>
              )}

              {selectedMedia ? (
                  <div className="contentEditorAssetEditor">
                    <div className="contentEditorAssetControls">
                    <button
                      type="button"
                      className="contentEditorButton--secondary"
                      disabled={assetIndex === 0}
                      onClick={() => moveGalleryMedia(assetIndex, -1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="contentEditorButton--secondary"
                      disabled={assetIndex >= gallery.length - 1}
                      onClick={() => moveGalleryMedia(assetIndex, 1)}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="contentEditorButton--danger"
                      onClick={() => removeGalleryMedia(assetIndex)}
                    >
                      Remove
                    </button>
                    </div>

                    <div className="contentEditorGrid">
                    <label className="contentEditorField">
                      <span>Kind</span>
                      <select
                        value={selectedMedia.kind}
                        onChange={(e) =>
                          updateGalleryMedia(assetIndex, (media) =>
                            e.target.value === 'video'
                              ? { kind: 'video', src: media.src, poster: media.kind === 'video' ? media.poster : '' }
                              : { kind: 'image', src: media.src, alt: media.kind === 'image' ? media.alt : '' },
                          )
                        }
                      >
                        <option value="image">image</option>
                        <option value="video">video</option>
                      </select>
                    </label>
                    <Field
                      label="Asset path"
                      value={selectedMedia.src}
                      onChange={(src) => updateGalleryMedia(assetIndex, (media) => ({ ...media, src }))}
                    />
                    <div className="contentEditorUploadSlot">
                      <span>Asset file</span>
                      <UploadButton
                        label="Choose asset file"
                        accept={selectedMedia.kind === 'video' ? 'video/*' : 'image/*'}
                        target={selectedMedia.kind === 'video' ? 'video' : 'gallery'}
                        projectId={selectedProject.id}
                        onStatus={setUploadStatus}
                        onUploaded={(src, file) =>
                          updateGalleryMedia(assetIndex, (media) =>
                            media.kind === 'image'
                              ? { ...media, src, alt: media.alt || fileNameFromPath(file.name) }
                              : { ...media, src },
                          )
                        }
                      />
                    </div>
                    {selectedMedia.kind === 'image' ? (
                      <Field
                        label="Alt text"
                        value={selectedMedia.alt}
                        onChange={(alt) => updateGalleryMedia(assetIndex, (media) => ({ ...media, alt }))}
                      />
                    ) : (
                      <Field
                        label="Poster"
                        value={selectedMedia.poster ?? ''}
                        onChange={(poster) => updateGalleryMedia(assetIndex, (media) => ({ ...media, poster }))}
                      />
                    )}
                    {selectedMedia.kind === 'video' ? (
                      <div className="contentEditorUploadSlot">
                        <span>Poster file</span>
                        <UploadButton
                          label="Choose poster"
                          accept="image/*"
                          target="posters"
                          projectId={selectedProject.id}
                          onStatus={setUploadStatus}
                          onUploaded={(poster) =>
                            updateGalleryMedia(assetIndex, (media) => ({ ...media, poster }))
                          }
                        />
                      </div>
                    ) : null}
                    <label className="contentEditorField">
                      <span>Presentation</span>
                      <select
                        value={presentationMode(selectedMedia.presentation)}
                        onChange={(e) =>
                          updateGalleryMedia(assetIndex, (media) =>
                            updateMediaPresentation(media, e.target.value as 'fill' | 'framed'),
                          )
                        }
                      >
                        <option value="fill">fill</option>
                        <option value="framed">framed</option>
                      </select>
                    </label>
                    {selectedMedia.presentation?.mode === 'framed' ? (
                      <>
                        <Field
                          label="Background"
                          value={backgroundValue(selectedMedia.presentation.background)}
                          onChange={(value) =>
                            updateGalleryMedia(assetIndex, (media) => ({
                              ...media,
                              presentation:
                                media.presentation?.mode === 'framed'
                                  ? {
                                      ...media.presentation,
                                      background: value.startsWith('#')
                                        ? { kind: 'color', value }
                                        : { kind: 'image', src: value },
                                    }
                                  : media.presentation,
                            }))
                          }
                        />
                        <div className="contentEditorUploadSlot">
                          <span>Background file</span>
                          <UploadButton
                            label="Choose background"
                            accept="image/*"
                            target="backgrounds"
                            projectId={selectedProject.id}
                            onStatus={setUploadStatus}
                            onUploaded={(src) =>
                              updateGalleryMedia(assetIndex, (media) => ({
                                ...media,
                                presentation:
                                  media.presentation?.mode === 'framed'
                                    ? { ...media.presentation, background: { kind: 'image', src } }
                                    : media.presentation,
                              }))
                            }
                          />
                        </div>
                        <Field
                          label="Padding"
                          value={selectedMedia.presentation.padding ?? ''}
                          onChange={(padding) =>
                            updateGalleryMedia(assetIndex, (media) => ({
                              ...media,
                              presentation:
                                media.presentation?.mode === 'framed'
                                  ? { ...media.presentation, padding }
                                  : media.presentation,
                            }))
                          }
                        />
                        <label className="contentEditorField">
                          <span>Shadow</span>
                          <select
                            value={selectedMedia.presentation.shadow ?? 'soft'}
                            onChange={(e) =>
                              updateGalleryMedia(assetIndex, (media) => ({
                                ...media,
                                presentation:
                                  media.presentation?.mode === 'framed'
                                    ? { ...media.presentation, shadow: e.target.value as 'soft' | 'none' }
                                    : media.presentation,
                              }))
                            }
                          >
                            <option value="soft">soft</option>
                            <option value="none">none</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    </div>
                  </div>
              ) : null}
              </div>
            </section>

            <section className="contentEditorBlock">
              <div className="contentEditorBlockHead contentEditorBlockHead--withAction">
              <div>
                <h2>Metadata</h2>
                <span>{archive?.items.length ?? 0} archive items</span>
              </div>
              <UploadButton
                label="Add archive file"
                accept="image/*,video/*"
                target="archive"
                onStatus={setUploadStatus}
                onUploaded={addArchiveUpload}
              />
              </div>
              <div className="contentEditorGrid">
              <Field
                label="Above-fold preload count"
                value={String(archive?.aboveFoldCount ?? 12)}
                onChange={(value) =>
                  setArchive((current) =>
                    current ? { ...current, aboveFoldCount: Number.parseInt(value, 10) || 0 } : current,
                  )
                }
              />
              <Field
                label="Teaser item ids"
                value={archive?.teaserItemIds?.join(', ') ?? ''}
                onChange={(value) =>
                  setArchive((current) =>
                    current
                      ? {
                          ...current,
                          teaserItemIds: value
                            .split(',')
                            .map((id) => id.trim())
                            .filter(Boolean),
                        }
                      : current,
                  )
                }
              />
              </div>
            </section>
          </div>

          <aside className="contentEditorInspector" aria-label="Preview and export">
            <div className="contentEditorPreviewWrap">
              <Preview
                media={previewMedia}
                label={selectedMedia ? `Gallery ${String(assetIndex + 1).padStart(2, '0')}` : 'Cover preview'}
                category={selectedProject.category}
                description={selectedProject.description ?? defaultProjectDescription}
              />
            </div>

            <div className="contentEditorInspectorPanel">
              <div className="contentEditorInspectorHead">
                <strong>Local only</strong>
                <span>{uploadStatus || (lastExport ? `Last export: ${lastExport}` : 'No recent changes exported')}</span>
              </div>
              <p>
                Uploads copy files into <code>public/images/</code>. Exports download JSON for <code>content/</code>.
              </p>
              <div className="contentEditorActions">
                <button type="button" onClick={() => exportJson(`${selectedProject.id}.json`, selectedProject)}>
                  Export project
                </button>
                <button
                  type="button"
                  className="contentEditorButton--secondary"
                  onClick={() => archive && exportJson('archive.json', archive)}
                >
                  Export archive
                </button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
