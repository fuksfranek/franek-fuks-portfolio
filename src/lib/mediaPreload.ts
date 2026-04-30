import { useEffect, useState } from 'react'

const IMAGE_CACHE_MAX = 96
const VIDEO_CACHE_MAX = 8

const imageCache = new Map<string, HTMLImageElement>()
const imageInflight = new Map<string, Promise<HTMLImageElement | null>>()
const videoBlobCache = new Map<string, string>()
const videoBlobInflight = new Map<string, Promise<string>>()

function rememberImage(src: string, image: HTMLImageElement) {
  imageCache.delete(src)
  imageCache.set(src, image)
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value
    if (!oldest) break
    imageCache.delete(oldest)
  }
}

function rememberVideo(src: string, url: string) {
  videoBlobCache.delete(src)
  videoBlobCache.set(src, url)
  while (videoBlobCache.size > VIDEO_CACHE_MAX) {
    const oldest = videoBlobCache.keys().next().value
    if (!oldest) break
    const oldUrl = videoBlobCache.get(oldest)
    videoBlobCache.delete(oldest)
    if (oldUrl?.startsWith('blob:')) URL.revokeObjectURL(oldUrl)
  }
}

export function getDecodedImage(src: string) {
  const cached = imageCache.get(src)
  if (!cached) return null
  imageCache.delete(src)
  imageCache.set(src, cached)
  return cached
}

export function loadDecodedImage(src: string): Promise<HTMLImageElement | null> {
  const cached = getDecodedImage(src)
  if (cached) return Promise.resolve(cached)

  const inflight = imageInflight.get(src)
  if (inflight) return inflight

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.src = src

    const resolveLoaded = () => {
      imageInflight.delete(src)
      if (image.naturalWidth <= 0) {
        resolve(null)
        return
      }
      rememberImage(src, image)
      resolve(image)
    }

    if (image.complete) {
      resolveLoaded()
      return
    }

    if (typeof image.decode === 'function') {
      image.decode().then(resolveLoaded, () => {
        imageInflight.delete(src)
        resolve(null)
      })
      return
    }

    image.onload = resolveLoaded
    image.onerror = () => {
      imageInflight.delete(src)
      resolve(null)
    }
  })

  imageInflight.set(src, promise)
  return promise
}

export function preloadImage(src: string) {
  void loadDecodedImage(src)
}

export function shouldAggressivelyPreloadVideo() {
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (conn?.saveData) return false
  return conn?.effectiveType !== '2g'
}

export function loadVideoAsBlobUrl(src: string): Promise<string> {
  const cached = videoBlobCache.get(src)
  if (cached) {
    videoBlobCache.delete(src)
    videoBlobCache.set(src, cached)
    return Promise.resolve(cached)
  }
  const inflight = videoBlobInflight.get(src)
  if (inflight) return inflight

  const promise = fetch(src, { credentials: 'same-origin' })
    .then((res) => {
      if (!res.ok) throw new Error(`Video fetch failed: ${res.status} ${src}`)
      return res.blob()
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      rememberVideo(src, url)
      videoBlobInflight.delete(src)
      return url
    })
    .catch((err) => {
      videoBlobInflight.delete(src)
      throw err
    })

  videoBlobInflight.set(src, promise)
  return promise
}

export function preloadVideo(src: string) {
  if (!shouldAggressivelyPreloadVideo()) return
  void loadVideoAsBlobUrl(src).catch(() => {})
}

/** Resolves to a stable blob URL for the video; falls back to direct src on fetch failure. */
export function useResolvedVideoSrc(src: string, enabled: boolean): string | undefined {
  const [resolved, setResolved] = useState<{ src: string; url: string } | null>(() => {
    const cached = enabled ? videoBlobCache.get(src) : undefined
    return cached ? { src, url: cached } : null
  })

  useEffect(() => {
    if (!enabled) return
    const cached = videoBlobCache.get(src)
    let cancelled = false
    const load = cached ? Promise.resolve(cached) : loadVideoAsBlobUrl(src)
    load
      .then((url) => {
        if (!cancelled) setResolved({ src, url })
      })
      .catch(() => {
        if (!cancelled) setResolved({ src, url: src })
      })
    return () => {
      cancelled = true
    }
  }, [src, enabled])

  return enabled && resolved?.src === src ? resolved.url : undefined
}
