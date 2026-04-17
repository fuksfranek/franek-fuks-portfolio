/**
 * Samples the visible stage media (object-fit: cover) to pick high-contrast chrome
 * (black vs white) for overlays. Same-origin assets only; returns null if sampling fails.
 */

export type StageChromeTone = 'onDark' | 'onLight'

function srgbChannelToLinear(c255: number) {
  const c = c255 / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance for sRGB 0–255 channels */
export function relativeLuminance(r: number, g: number, b: number) {
  const R = srgbChannelToLinear(r)
  const G = srgbChannelToLinear(g)
  const B = srgbChannelToLinear(b)
  return 0.2126 * R + 0.7152 * G + 0.0722 * B
}

function naturalSize(media: HTMLImageElement | HTMLVideoElement) {
  if (media instanceof HTMLVideoElement) {
    const w = media.videoWidth
    const h = media.videoHeight
    return w > 0 && h > 0 ? { w, h } : null
  }
  const w = media.naturalWidth
  const h = media.naturalHeight
  return w > 0 && h > 0 ? { w, h } : null
}

/** Source crop for object-fit: cover, object-position: center */
function coverSourceRect(nw: number, nh: number, dw: number, dh: number) {
  const scale = Math.max(dw / nw, dh / nh)
  const sw = dw / scale
  const sh = dh / scale
  const sx = (nw - sw) / 2
  const sy = (nh - sh) / 2
  return { sx, sy, sw, sh }
}

/** Normalized sample points in element client space (top-left origin) */
const SAMPLE_UV: { u: number; v: number }[] = [
  { u: 0.1, v: 0.11 },
  { u: 0.9, v: 0.11 },
  { u: 0.5, v: 0.86 },
]

const LUMA_THRESHOLD = 0.56

/**
 * `onDark` → image reads dark → use light foreground (white).
 * `onLight` → image reads light → use dark foreground (black).
 */
export function sampleStageChromeTone(media: HTMLImageElement | HTMLVideoElement): StageChromeTone | null {
  const dw = media.clientWidth
  const dh = media.clientHeight
  if (dw < 8 || dh < 8) return null

  const nat = naturalSize(media)
  if (!nat) return null

  const { sx, sy, sw, sh } = coverSourceRect(nat.w, nat.h, dw, dh)

  const bufW = Math.min(144, Math.max(32, Math.round(dw / 6)))
  const bufH = Math.min(144, Math.max(32, Math.round(dh / 6)))

  const canvas = document.createElement('canvas')
  canvas.width = bufW
  canvas.height = bufH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  try {
    ctx.drawImage(media, sx, sy, sw, sh, 0, 0, bufW, bufH)
  } catch {
    return null
  }

  let imageData: ImageData
  try {
    imageData = ctx.getImageData(0, 0, bufW, bufH)
  } catch {
    return null
  }

  const { data } = imageData
  let sum = 0
  for (const { u, v } of SAMPLE_UV) {
    const ix = Math.min(bufW - 1, Math.max(0, Math.floor(u * bufW)))
    const iy = Math.min(bufH - 1, Math.max(0, Math.floor(v * bufH)))
    const i = (iy * bufW + ix) * 4
    sum += relativeLuminance(data[i]!, data[i + 1]!, data[i + 2]!)
  }

  const avg = sum / SAMPLE_UV.length
  return avg >= LUMA_THRESHOLD ? 'onLight' : 'onDark'
}
