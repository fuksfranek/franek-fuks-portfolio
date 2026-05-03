import { easeViewInset } from './easeViewInset'
import { loadDecodedImage } from './mediaPreload'

/** Same factor as `--media-clip-overscan` in index.css */
const MEDIA_CLIP_OVERSCAN = 1.035

export type RectSnapshot = {
  left: number
  top: number
  width: number
  height: number
}

export type GenieFlightRequest = {
  coverSrc: string
  revealSrc: string | null
  source: RectSnapshot
  destination: RectSnapshot
}

export type GenieFlightHandle = {
  cancel: () => void
}

export const GENIE_FLIGHT_TIMING = {
  durationMs: 820,
  coverDissolveEnd: 0.54,
  stageRevealStart: 0.56,
  stageRevealEnd: 0.9,
  canvasFadeStart: 0.9,
  maxMotionBlur: 1.22,
  maxHandoffBlur: 0.88,
  maxCoverDissolveBlur: 2.55,
} as const

export function genieRailGapDelayMs(): number {
  return Math.round(GENIE_FLIGHT_TIMING.durationMs * GENIE_FLIGHT_TIMING.stageRevealEnd)
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function smootherStep(t: number) {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

function coverCrop(image: HTMLImageElement, rect: RectSnapshot) {
  const iw = image.naturalWidth || 1
  const ih = image.naturalHeight || 1
  const scale = Math.max(rect.width / iw, rect.height / ih)
  const width = rect.width / scale
  const height = rect.height / scale
  const sxBase = (iw - width) / 2
  const syBase = (ih - height) / 2
  const os = MEDIA_CLIP_OVERSCAN
  const sw = width / os
  const sh = height / os
  return {
    sx: sxBase + (width - sw) / 2,
    sy: syBase + (height - sh) / 2,
    sw,
    sh,
  }
}

function genieVertices(expanded: RectSnapshot, tucked: RectSnapshot, minimizeProgress: number, rows: number) {
  const slideProgress = clamp01(minimizeProgress / 0.52)
  const translateProgress = clamp01((minimizeProgress - 0.24) / 0.76)
  const expandedRight = expanded.left + expanded.width
  const expandedBottom = expanded.top + expanded.height
  const tuckedRight = tucked.left + tucked.width
  const tuckedBottom = tucked.top + tucked.height
  const verticalDistance = tucked.top - expanded.top
  const topY = expanded.top + translateProgress * verticalDistance
  const unclampedBottomY = expandedBottom + translateProgress * verticalDistance
  const bottomY =
    verticalDistance >= 0
      ? Math.min(unclampedBottomY, tuckedBottom)
      : Math.max(unclampedBottomY, tuckedBottom)
  const leftBottomX = mix(expanded.left, tucked.left, slideProgress)
  const rightBottomX = mix(expandedRight, tuckedRight, slideProgress)
  const curveHeight = tucked.top - expanded.top

  const boundaryX = (y: number, topX: number, bottomX: number) => {
    if (Math.abs(curveHeight) < 1) return mix(topX, bottomX, slideProgress)
    const raw = (y - expanded.top) / curveHeight
    if (raw <= 0) return topX
    if (raw >= 1) return bottomX
    return mix(topX, bottomX, smootherStep(raw))
  }

  return Array.from({ length: rows + 1 }, (_, index) => {
    const rowProgress = index / rows
    const y = mix(topY, bottomY, rowProgress)
    return {
      y,
      left: boundaryX(y, expanded.left, leftBottomX),
      right: boundaryX(y, expandedRight, rightBottomX),
    }
  })
}

function boundsFromGenieVertices(vertices: ReturnType<typeof genieVertices>): RectSnapshot {
  const top = vertices[0]
  const bottom = vertices[vertices.length - 1]
  const left = Math.min(...vertices.map((vertex) => vertex.left))
  const right = Math.max(...vertices.map((vertex) => vertex.right))
  return {
    left,
    top: top.y,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom.y - top.y),
  }
}

const vertexSource = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentSource = `
  precision highp float;

  uniform vec2 u_viewport;
  uniform float u_dpr;
  uniform vec4 u_expanded;
  uniform vec4 u_tucked;
  uniform vec4 u_coverCrop;
  uniform vec4 u_revealCrop;
  uniform vec2 u_coverSize;
  uniform vec2 u_revealSize;
  uniform float u_minimize;
  uniform float u_fade;
  uniform float u_coverAlpha;
  uniform float u_hasReveal;
  uniform float u_radius;
  uniform float u_motionBlur;
  uniform float u_coverBlur;
  uniform sampler2D u_cover;
  uniform sampler2D u_reveal;

  float smoother(float t) {
    float x = clamp(t, 0.0, 1.0);
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  }

  float boundaryX(float y, float topX, float bottomX, float expandedTop, float tuckedTop) {
    float curveHeight = tuckedTop - expandedTop;
    if (abs(curveHeight) < 1.0) {
      return mix(topX, bottomX, clamp(u_minimize / 0.52, 0.0, 1.0));
    }
    float raw = (y - expandedTop) / curveHeight;
    if (raw <= 0.0) return topX;
    if (raw >= 1.0) return bottomX;
    return mix(topX, bottomX, smoother(raw));
  }

  vec4 sampleImage(sampler2D tex, vec2 uv, vec2 size, float blurPx) {
    float blur = max(0.0, blurPx);
    if (blur < 0.01) {
      return texture2D(tex, uv);
    }
    vec2 o = blur / size;
    vec4 color = texture2D(tex, uv) * 0.44;
    color += texture2D(tex, uv + vec2(o.x, 0.0)) * 0.14;
    color += texture2D(tex, uv - vec2(o.x, 0.0)) * 0.14;
    color += texture2D(tex, uv + vec2(0.0, o.y)) * 0.14;
    color += texture2D(tex, uv - vec2(0.0, o.y)) * 0.14;
    return color;
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x / u_dpr, u_viewport.y - (gl_FragCoord.y / u_dpr));

    float slide = clamp(u_minimize / 0.52, 0.0, 1.0);
    float translate = clamp((u_minimize - 0.24) / 0.76, 0.0, 1.0);
    float expandedRight = u_expanded.x + u_expanded.z;
    float expandedBottom = u_expanded.y + u_expanded.w;
    float tuckedRight = u_tucked.x + u_tucked.z;
    float tuckedBottom = u_tucked.y + u_tucked.w;
    float verticalDistance = u_tucked.y - u_expanded.y;
    float topY = u_expanded.y + translate * verticalDistance;
    float unclampedBottomY = expandedBottom + translate * verticalDistance;
    float bottomY = verticalDistance >= 0.0
      ? min(unclampedBottomY, tuckedBottom)
      : max(unclampedBottomY, tuckedBottom);
    float leftBottomX = mix(u_expanded.x, u_tucked.x, slide);
    float rightBottomX = mix(expandedRight, tuckedRight, slide);
    float left = boundaryX(p.y, u_expanded.x, leftBottomX, u_expanded.y, u_tucked.y);
    float right = boundaryX(p.y, expandedRight, rightBottomX, u_expanded.y, u_tucked.y);
    float height = max(1.0, bottomY - topY);
    float width = max(1.0, right - left);

    float feather = 1.2;
    float alpha =
      smoothstep(0.0, feather, p.x - left) *
      smoothstep(0.0, feather, right - p.x) *
      smoothstep(0.0, feather, p.y - topY) *
      smoothstep(0.0, feather, bottomY - p.y);

    float r = min(u_radius, min(width * 0.5, height * 0.5));
    float topLeft = u_expanded.x;
    float topRight = expandedRight;
    float bottomLeft = leftBottomX;
    float bottomRight = rightBottomX;

    if (p.y < topY + r && p.x < topLeft + r) {
      alpha *= smoothstep(r + feather, r - feather, length(p - vec2(topLeft + r, topY + r)));
    }
    if (p.y < topY + r && p.x > topRight - r) {
      alpha *= smoothstep(r + feather, r - feather, length(p - vec2(topRight - r, topY + r)));
    }
    if (p.y > bottomY - r && p.x < bottomLeft + r) {
      alpha *= smoothstep(r + feather, r - feather, length(p - vec2(bottomLeft + r, bottomY - r)));
    }
    if (p.y > bottomY - r && p.x > bottomRight - r) {
      alpha *= smoothstep(r + feather, r - feather, length(p - vec2(bottomRight - r, bottomY - r)));
    }

    if (alpha <= 0.001) discard;

    float u = clamp((p.x - left) / width, 0.0, 1.0);
    float v = clamp((p.y - topY) / height, 0.0, 1.0);
    vec2 coverUv = (u_coverCrop.xy + vec2(u, v) * u_coverCrop.zw) / u_coverSize;
    vec2 revealUv = (u_revealCrop.xy + vec2(u, v) * u_revealCrop.zw) / u_revealSize;

    vec4 cover = sampleImage(u_cover, coverUv, u_coverSize, max(u_motionBlur, u_coverBlur));
    float midWeight = smoother((1.0 - u_coverAlpha) * u_coverAlpha * 4.0);
    float dissolveMush = sin((1.0 - u_coverAlpha) * 3.14159265) * midWeight;
    float revealBlurPx = u_motionBlur + u_coverBlur * dissolveMush * 1.38;
    vec4 reveal = sampleImage(u_reveal, revealUv, u_revealSize, revealBlurPx);
    vec4 color = mix(cover, mix(reveal, cover, u_coverAlpha), u_hasReveal);
    color.a *= alpha * u_fade;
    gl_FragColor = color;
  }
`

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createTexture(gl: WebGLRenderingContext, image: HTMLImageElement) {
  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  return texture
}

export function startGenieFlight({
  canvas,
  request,
  radius,
  onStageProgress,
  onDone,
}: {
  canvas: HTMLCanvasElement
  request: GenieFlightRequest
  radius: number
  onStageProgress: (envelope: number, timelineRaw: number) => void
  onDone: () => void
}): GenieFlightHandle {
  let cancelled = false
  let raf = 0
  let coverTexture: WebGLTexture | null = null
  let revealTexture: WebGLTexture | null = null
  let buffer: WebGLBuffer | null = null
  let program: WebGLProgram | null = null
  let resizeCanvas: (() => void) | null = null

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
  })

  const finish = () => {
    if (cancelled) return
    cancelled = true
    onStageProgress(1, 1)
    onDone()
  }

  if (!gl) {
    finish()
    return { cancel: () => {} }
  }

  const dispose = () => {
    cancelAnimationFrame(raf)
    if (resizeCanvas) window.removeEventListener('resize', resizeCanvas)
    if (coverTexture) gl.deleteTexture(coverTexture)
    if (revealTexture) gl.deleteTexture(revealTexture)
    if (buffer) gl.deleteBuffer(buffer)
    if (program) gl.deleteProgram(program)
  }

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  program = gl.createProgram()
  if (!vertexShader || !fragmentShader || !program) {
    dispose()
    finish()
    return { cancel: () => {} }
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    dispose()
    finish()
    return { cancel: () => {} }
  }

  const attribPosition = gl.getAttribLocation(program, 'a_position')
  const getUniform = (name: string) => gl.getUniformLocation(program, name)
  const uniforms = {
    viewport: getUniform('u_viewport'),
    dpr: getUniform('u_dpr'),
    expanded: getUniform('u_expanded'),
    tucked: getUniform('u_tucked'),
    coverCrop: getUniform('u_coverCrop'),
    revealCrop: getUniform('u_revealCrop'),
    coverSize: getUniform('u_coverSize'),
    revealSize: getUniform('u_revealSize'),
    minimize: getUniform('u_minimize'),
    fade: getUniform('u_fade'),
    coverAlpha: getUniform('u_coverAlpha'),
    hasReveal: getUniform('u_hasReveal'),
    radius: getUniform('u_radius'),
    motionBlur: getUniform('u_motionBlur'),
    coverBlur: getUniform('u_coverBlur'),
    cover: getUniform('u_cover'),
    reveal: getUniform('u_reveal'),
  }

  if (attribPosition < 0 || Object.values(uniforms).some((location) => location === null)) {
    dispose()
    finish()
    return { cancel: () => {} }
  }

  buffer = gl.createBuffer()
  if (!buffer) {
    dispose()
    finish()
    return { cancel: () => {} }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.useProgram(program)
  gl.enableVertexAttribArray(attribPosition)
  gl.vertexAttribPointer(attribPosition, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.clearColor(0, 0, 0, 0)

  resizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.ceil(width * dpr)
    canvas.height = Math.ceil(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    gl.viewport(0, 0, canvas.width, canvas.height)
  }

  const setRect = (location: WebGLUniformLocation | null, rect: RectSnapshot) => {
    gl.uniform4f(location, rect.left, rect.top, rect.width, rect.height)
  }

  const setCrop = (location: WebGLUniformLocation | null, crop: ReturnType<typeof coverCrop>) => {
    gl.uniform4f(location, crop.sx, crop.sy, crop.sw, crop.sh)
  }

  const draw = (coverImage: HTMLImageElement, revealImage: HTMLImageElement | null, start: number) => {
    const tick = (now: number) => {
      if (cancelled || !coverTexture) return

      const rawProgress = clamp01((now - start) / GENIE_FLIGHT_TIMING.durationMs)
      const progress = easeViewInset(rawProgress)
      const minimizeProgress = 1 - progress
      const vertices = genieVertices(request.destination, request.source, minimizeProgress, 8)
      const currentBounds = boundsFromGenieVertices(vertices)
      const stageRevealLinear = clamp01(
        (rawProgress - GENIE_FLIGHT_TIMING.stageRevealStart) /
          (GENIE_FLIGHT_TIMING.stageRevealEnd - GENIE_FLIGHT_TIMING.stageRevealStart),
      )
      const stageProgress = smootherStep(smootherStep(stageRevealLinear))

      const fadeTailT =
        rawProgress >= GENIE_FLIGHT_TIMING.canvasFadeStart
          ? clamp01(
              (rawProgress - GENIE_FLIGHT_TIMING.canvasFadeStart) /
                (1 - GENIE_FLIGHT_TIMING.canvasFadeStart),
            )
          : 0
      const fade =
        rawProgress < GENIE_FLIGHT_TIMING.canvasFadeStart ? 1 : 1 - smootherStep(smootherStep(fadeTailT))
      const coverRevealProgress = clamp01(rawProgress / GENIE_FLIGHT_TIMING.coverDissolveEnd)
      const coverAlpha = 1 - smootherStep(smootherStep(coverRevealProgress))
      const handoffBlurIn = smootherStep(clamp01((rawProgress - 0.62) / 0.2))
      const handoffBlurOut = 1 - smootherStep(clamp01((rawProgress - 0.88) / 0.12))
      const velocityBlur =
        Math.sin(rawProgress * Math.PI) * GENIE_FLIGHT_TIMING.maxMotionBlur +
        handoffBlurIn * handoffBlurOut * GENIE_FLIGHT_TIMING.maxHandoffBlur
      const coverBlur =
        smootherStep(smootherStep(coverRevealProgress)) * GENIE_FLIGHT_TIMING.maxCoverDissolveBlur

      onStageProgress(stageProgress, rawProgress)
      gl.useProgram(program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, coverTexture)
      gl.uniform1i(uniforms.cover, 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, revealTexture ?? coverTexture)
      gl.uniform1i(uniforms.reveal, 1)

      gl.uniform2f(uniforms.viewport, window.innerWidth, window.innerHeight)
      gl.uniform1f(uniforms.dpr, Math.min(window.devicePixelRatio || 1, 2))
      setRect(uniforms.expanded, request.destination)
      setRect(uniforms.tucked, request.source)
      setCrop(uniforms.coverCrop, coverCrop(coverImage, currentBounds))
      setCrop(uniforms.revealCrop, revealImage ? coverCrop(revealImage, currentBounds) : coverCrop(coverImage, currentBounds))
      gl.uniform2f(uniforms.coverSize, coverImage.naturalWidth, coverImage.naturalHeight)
      gl.uniform2f(
        uniforms.revealSize,
        revealImage?.naturalWidth ?? coverImage.naturalWidth,
        revealImage?.naturalHeight ?? coverImage.naturalHeight,
      )
      gl.uniform1f(uniforms.minimize, minimizeProgress)
      gl.uniform1f(uniforms.fade, fade)
      gl.uniform1f(uniforms.coverAlpha, coverAlpha)
      gl.uniform1f(uniforms.hasReveal, revealImage && revealTexture ? 1 : 0)
      gl.uniform1f(uniforms.radius, radius)
      gl.uniform1f(uniforms.motionBlur, velocityBlur)
      gl.uniform1f(uniforms.coverBlur, coverBlur)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (rawProgress < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        dispose()
        finish()
      }
    }

    raf = requestAnimationFrame(tick)
  }

  Promise.all([
    loadDecodedImage(request.coverSrc),
    request.revealSrc ? loadDecodedImage(request.revealSrc) : Promise.resolve(null),
  ]).then(([coverImage, revealImage]) => {
    if (cancelled) return
    if (!coverImage) {
      dispose()
      finish()
      return
    }

    coverTexture = createTexture(gl, coverImage)
    revealTexture = revealImage ? createTexture(gl, revealImage) : null
    if (!coverTexture) {
      dispose()
      finish()
      return
    }

    resizeCanvas?.()
    window.addEventListener('resize', resizeCanvas!)
    onStageProgress(0, 0)
    draw(coverImage, revealImage, performance.now())
  })

  return {
    cancel: () => {
      cancelled = true
      dispose()
    },
  }
}
