import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { Media } from './data/projects'
import { projects } from './data/projects'
import './App.css'

const USE_COLOR_MEDIA_PLACEHOLDERS = true

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function mediaPlaceholderColor(media: Media) {
  const key =
    media.kind === 'video' ? `video:${media.src}:${media.poster ?? ''}` : `image:${media.src}:${media.alt}`
  const hash = hashString(key)
  const hue = hash % 360
  const saturation = 58 + (hash % 18)
  const lightness = 46 + ((hash >> 3) % 18)
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

function MediaView({
  media,
  className,
  fit,
  variant = 'full',
}: {
  media: Media
  className?: string
  fit: 'cover' | 'contain'
  /** Slider cards: show poster still for video instead of playing */
  variant?: 'full' | 'thumb'
}) {
  if (USE_COLOR_MEDIA_PLACEHOLDERS) {
    return <div className={className} style={{ background: mediaPlaceholderColor(media) }} aria-hidden />
  }

  if (media.kind === 'video') {
    if (variant === 'thumb' && media.poster) {
      return (
        <img
          className={className}
          src={media.poster}
          alt=""
          draggable={false}
          style={{ objectFit: fit }}
        />
      )
    }
    return (
      <video
        className={className}
        src={media.src}
        poster={media.poster}
        muted
        playsInline
        loop
        autoPlay={variant === 'full'}
        preload={variant === 'thumb' ? 'metadata' : 'auto'}
        controls={false}
        style={{ objectFit: fit }}
      />
    )
  }
  return (
    <img
      className={className}
      src={media.src}
      alt={media.alt}
      draggable={false}
      style={{ objectFit: fit }}
    />
  )
}

const WHEEL_STEP = 80
/** Reveal rail on smaller upward wheel delta so motion lines up with the gesture */
const RAIL_WHEEL_SHOW_EARLY = 32
const SWIPE_STEP = 42
/** Reveal rail as soon as swipe-down passes this (same direction as touchend show) */
const RAIL_TOUCH_SHOW_PX = 28
const INFO_WHEEL_STEP = 56
const RAIL_WHEEL_X_MIN = 1.5
const RAIL_HORIZONTAL_RATIO = 0.65
const VERTICAL_INTENT_RATIO = 1.12
const DRAG_CLICK_SUPPRESS_MS = 220
const DRAG_START_PX = 8
/** px/ms; release below this uses no inertial scroll */
const RAIL_MOMENTUM_MIN_VELOCITY = 0.028
/** Extra carry so flicks feel responsive */
const RAIL_MOMENTUM_BOOST = 1.22
/** Per ~16ms frame; used with delta-time for frame-rate independence */
const RAIL_MOMENTUM_FRICTION = 0.895
/** EMA blend for pointer velocity samples */
const RAIL_VELOCITY_SMOOTH = 0.55
const RAIL_MOMENTUM_STOP = 0.012
/** Extra space between cards at max intensity (px); smaller = less scroll/layout feedback */
const RAIL_GAP_MAX_EXTRA_PX = 6
/** |scroll speed| (px/ms) that reaches ~full extra gap */
const RAIL_GAP_SPEED_REF = 1.05
/** Wheel delta magnitude (px) treated as a strong horizontal intent */
const RAIL_GAP_WHEEL_REF = 92
/** Blend toward measured speed each scroll sample */
const RAIL_GAP_SMOOTH = 0.42
/** Decay while intensity is moderate–high (after input stops) */
const RAIL_GAP_DECAY = 0.8
/** Faster decay for the last bit so the strip does not “creep” closed */
const RAIL_GAP_DECAY_TAIL = 0.66
/** Below this normalized intensity, snap gap closed (avoids long tail + jitter) */
const RAIL_GAP_SNAP = 0.058
/** Wait this long after last feed before decaying */
const RAIL_GAP_IDLE_MS = 18
/** Cap insane single-sample speeds from scroll bursts */
const RAIL_GAP_SPEED_CAP = 5.2
const STORY_DURATION_MS = 4200
const CURSOR_IDLE_MS = 1300
const CURSOR_HIDE_DISTANCE = 68

type ViewState = {
  projectIndex: number
  assetIndex: number
}

type ViewAction =
  | { type: 'prevAsset' }
  | { type: 'nextAsset' }
  | { type: 'prevProject' }
  | { type: 'nextProject' }
  | { type: 'selectProject'; index: number }

type RailStaggerState = {
  ready: boolean
  stagger: number[]
  visible: boolean[]
}

type CursorZone = 'none' | 'stage' | 'rail'
type CursorDirection = 'left' | 'right' | 'drag'
type CursorUiState = {
  zone: CursorZone
  direction: CursorDirection
  idle: boolean
  proximityHidden: boolean
}

function clampProjectIndex(index: number) {
  return Math.max(0, Math.min(projects.length - 1, index))
}

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'prevAsset') {
    const galleryLength = projects[state.projectIndex].gallery.length
    if (galleryLength <= 1) return state
    return {
      ...state,
      assetIndex: state.assetIndex <= 0 ? galleryLength - 1 : state.assetIndex - 1,
    }
  }

  if (action.type === 'nextAsset') {
    const galleryLength = projects[state.projectIndex].gallery.length
    if (galleryLength <= 1) return state
    return {
      ...state,
      assetIndex: state.assetIndex >= galleryLength - 1 ? 0 : state.assetIndex + 1,
    }
  }

  if (action.type === 'prevProject') {
    if (state.projectIndex <= 0) return state
    return {
      projectIndex: state.projectIndex - 1,
      assetIndex: 0,
    }
  }

  if (action.type === 'nextProject') {
    if (state.projectIndex >= projects.length - 1) return state
    return {
      projectIndex: state.projectIndex + 1,
      assetIndex: 0,
    }
  }

  const nextProjectIndex = clampProjectIndex(action.index)
  if (nextProjectIndex === state.projectIndex) return state
  return {
    projectIndex: nextProjectIndex,
    assetIndex: 0,
  }
}

function wheelPixels(e: WheelEvent) {
  if (e.deltaMode === 1) return { x: e.deltaX * 16, y: e.deltaY * 16 }
  if (e.deltaMode === 2) return { x: e.deltaX * 400, y: e.deltaY * 400 }
  return { x: e.deltaX, y: e.deltaY }
}

function pointToRectDistance(x: number, y: number, rect: DOMRect) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return Math.hypot(dx, dy)
}

export default function App() {
  const [{ projectIndex, assetIndex }, dispatch] = useReducer(viewReducer, {
    projectIndex: 0,
    assetIndex: 0,
  })
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [railStagger, setRailStagger] = useState<RailStaggerState>({
    ready: false,
    stagger: [],
    visible: [],
  })
  const [isRailDragging, setIsRailDragging] = useState(false)
  const [isCursorPressed, setIsCursorPressed] = useState(false)
  const [cursorUi, setCursorUi] = useState<CursorUiState>({
    zone: 'none',
    direction: 'right',
    idle: false,
    proximityHidden: false,
  })
  const wheelAcc = useRef({ y: 0 })
  const infoWheelAcc = useRef(0)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const railTouchRevealStarted = useRef(false)
  const cursorElRef = useRef<HTMLDivElement>(null)
  const cursorUiRef = useRef<CursorUiState>({
    zone: 'none',
    direction: 'right',
    idle: false,
    proximityHidden: false,
  })
  const cursorIdleTimer = useRef<number | null>(null)
  const railDrag = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
    lastClientX: 0,
    lastTime: 0,
    /** Smoothed d(scrollLeft)/dt in px/ms */
    velocity: 0,
  })
  const railMomentumRaf = useRef<number | null>(null)
  const railTrackRef = useRef<HTMLDivElement>(null)
  const railGapSmoothedRef = useRef(0)
  const railGapRafRef = useRef<number | null>(null)
  const railGapLastFeedRef = useRef(0)
  const railScrollSampleRef = useRef({
    lastLeft: 0,
    lastT: 0,
    /** Detect scrollWidth shrink when gap CSS relaxes (ignore clamp-only deltas) */
    lastScrollWidth: 0,
  })
  const lastRailDragAt = useRef(0)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const stageWrapRef = useRef<HTMLElement>(null)
  const stageHitRef = useRef<HTMLDivElement>(null)
  const railWrapRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const railInitialScrollDone = useRef(false)

  const project = projects[projectIndex]
  const gallery = project.gallery
  const asset = gallery[assetIndex] ?? gallery[0]
  const canStep = gallery.length > 1

  const goPrev = useCallback(() => {
    dispatch({ type: 'prevAsset' })
  }, [])

  const goNext = useCallback(() => {
    dispatch({ type: 'nextAsset' })
  }, [])

  const goPrevProject = useCallback(() => {
    dispatch({ type: 'prevProject' })
  }, [])

  const goNextProject = useCallback(() => {
    dispatch({ type: 'nextProject' })
  }, [])

  const selectProject = useCallback((index: number) => {
    dispatch({ type: 'selectProject', index })
  }, [])

  const cancelRailMomentum = useCallback(() => {
    if (railMomentumRaf.current !== null) {
      cancelAnimationFrame(railMomentumRaf.current)
      railMomentumRaf.current = null
    }
    railRef.current?.classList.remove('rail--momentum')
  }, [])

  const cancelRailGapDynamics = useCallback(() => {
    if (railGapRafRef.current !== null) {
      cancelAnimationFrame(railGapRafRef.current)
      railGapRafRef.current = null
    }
    railGapSmoothedRef.current = 0
    railTrackRef.current?.style.setProperty('--rail-gap-extra', '0px')
  }, [])

  const ensureRailGapDecay = useCallback(() => {
    if (railGapRafRef.current !== null) return
    const tick = () => {
      const now = performance.now()
      if (now - railGapLastFeedRef.current < RAIL_GAP_IDLE_MS) {
        railGapRafRef.current = requestAnimationFrame(tick)
        return
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        cancelRailGapDynamics()
        return
      }
      const v = railGapSmoothedRef.current
      let next = v * (v > 0.2 ? RAIL_GAP_DECAY : RAIL_GAP_DECAY_TAIL)
      if (next < RAIL_GAP_SNAP) next = 0
      railGapSmoothedRef.current = next
      const el = railTrackRef.current
      if (el) {
        el.style.setProperty('--rail-gap-extra', `${next * RAIL_GAP_MAX_EXTRA_PX}px`)
      }
      if (next === 0) {
        railGapRafRef.current = null
        return
      }
      railGapRafRef.current = requestAnimationFrame(tick)
    }
    railGapRafRef.current = requestAnimationFrame(tick)
  }, [cancelRailGapDynamics])

  const feedRailGapFromScrollSpeed = useCallback(
    (speedPxPerMs: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const speed = Math.min(RAIL_GAP_SPEED_CAP, Math.abs(speedPxPerMs))
      const t = Math.min(1, speed / RAIL_GAP_SPEED_REF)
      const prev = railGapSmoothedRef.current
      railGapSmoothedRef.current = prev + (t - prev) * RAIL_GAP_SMOOTH
      railGapLastFeedRef.current = performance.now()
      const el = railTrackRef.current
      if (el) {
        el.style.setProperty('--rail-gap-extra', `${railGapSmoothedRef.current * RAIL_GAP_MAX_EXTRA_PX}px`)
      }
      ensureRailGapDecay()
    },
    [ensureRailGapDecay],
  )

  const feedRailGapWheelImpulse = useCallback(
    (wheelDeltaPx: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const t = Math.min(1, wheelDeltaPx / RAIL_GAP_WHEEL_REF)
      const prev = railGapSmoothedRef.current
      railGapSmoothedRef.current = Math.max(prev + (t - prev) * 0.48, t * 0.82)
      railGapLastFeedRef.current = performance.now()
      const el = railTrackRef.current
      if (el) {
        el.style.setProperty('--rail-gap-extra', `${railGapSmoothedRef.current * RAIL_GAP_MAX_EXTRA_PX}px`)
      }
      ensureRailGapDecay()
    },
    [ensureRailGapDecay],
  )

  const startRailMomentum = useCallback(
    (rail: HTMLDivElement, velocityPxPerMs: number) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      let v = velocityPxPerMs * RAIL_MOMENTUM_BOOST
      if (Math.abs(v) < RAIL_MOMENTUM_MIN_VELOCITY) return

      cancelRailMomentum()
      rail.classList.add('rail--momentum')
      let last = performance.now()

      const maxScroll = () => Math.max(0, rail.scrollWidth - rail.clientWidth)

      const step = (now: number) => {
        const dt = Math.min(48, now - last)
        last = now
        if (dt <= 0) {
          railMomentumRaf.current = requestAnimationFrame(step)
          return
        }

        const m = maxScroll()
        const prev = rail.scrollLeft
        let next = prev + v * dt
        if (next < 0) {
          next = 0
          v = 0
        } else if (next > m) {
          next = m
          v = 0
        } else {
          v *= Math.pow(RAIL_MOMENTUM_FRICTION, dt / 16)
        }
        rail.scrollLeft = next

        if (Math.abs(v) < RAIL_MOMENTUM_STOP) {
          cancelRailMomentum()
          return
        }
        railMomentumRaf.current = requestAnimationFrame(step)
      }

      railMomentumRaf.current = requestAnimationFrame(step)
    },
    [cancelRailMomentum],
  )

  const resetRailPointer = useCallback(() => {
    if (!railDrag.current.active) return
    const pointerId = railDrag.current.pointerId
    const rail = railRef.current
    if (pointerId >= 0 && rail?.hasPointerCapture(pointerId)) {
      rail.releasePointerCapture(pointerId)
    }
    railDrag.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
      lastClientX: 0,
      lastTime: 0,
      velocity: 0,
    }
    setIsRailDragging(false)
  }, [])

  const openInfo = useCallback(() => {
    setIsInfoOpen(true)
  }, [])

  const closeInfo = useCallback(() => {
    setIsInfoOpen(false)
    cancelRailMomentum()
    cancelRailGapDynamics()
    resetRailPointer()
  }, [cancelRailGapDynamics, cancelRailMomentum, resetRailPointer])

  const toggleInfo = useCallback(() => {
    if (isInfoOpen) {
      closeInfo()
      return
    }
    openInfo()
  }, [closeInfo, isInfoOpen, openInfo])

  useEffect(() => {
    cursorUiRef.current = cursorUi
  }, [cursorUi])

  useEffect(
    () => () => {
      cancelRailMomentum()
      cancelRailGapDynamics()
    },
    [cancelRailGapDynamics, cancelRailMomentum],
  )

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const now = performance.now()
    railScrollSampleRef.current = {
      lastLeft: rail.scrollLeft,
      lastT: now,
      lastScrollWidth: rail.scrollWidth,
    }
    const onScroll = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const ts = performance.now()
      const left = rail.scrollLeft
      const st = railScrollSampleRef.current
      const dt = ts - st.lastT
      const d = left - st.lastLeft
      const scrollWidth = rail.scrollWidth
      const maxS = Math.max(0, scrollWidth - rail.clientWidth)

      // When gap shrinks, scrollWidth drops and the browser clamps scrollLeft — ignore that delta
      if (st.lastScrollWidth > 0 && scrollWidth < st.lastScrollWidth - 0.5) {
        const lost = st.lastScrollWidth - scrollWidth
        if (Math.abs(d) <= lost + 8 && Math.abs(d) < 28) {
          st.lastScrollWidth = scrollWidth
          st.lastLeft = left
          st.lastT = ts
          return
        }
      }
      st.lastScrollWidth = scrollWidth

      if (dt < 5 || dt > 95) {
        st.lastLeft = left
        st.lastT = ts
        return
      }

      const edgePx = 3
      const atStart = left <= edgePx
      const atEnd = left >= maxS - edgePx
      if (atStart || atEnd) {
        if (Math.abs(d) < 3) {
          st.lastLeft = left
          st.lastT = ts
          return
        }
        if (atStart && d < 0) {
          st.lastLeft = left
          st.lastT = ts
          return
        }
        if (atEnd && d > 0) {
          st.lastLeft = left
          st.lastT = ts
          return
        }
      }

      const speed = Math.abs(d / dt)
      st.lastLeft = left
      st.lastT = ts
      if (speed < 0.022) return
      feedRailGapFromScrollSpeed(speed)
    }
    rail.addEventListener('scroll', onScroll, { passive: true })
    return () => rail.removeEventListener('scroll', onScroll)
  }, [feedRailGapFromScrollSpeed])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const now = performance.now()
    railScrollSampleRef.current = {
      lastLeft: rail.scrollLeft,
      lastT: now,
      lastScrollWidth: rail.scrollWidth,
    }
  }, [projectIndex])

  const isNearCursorHideTarget = useCallback((x: number, y: number) => {
    const targets = document.querySelectorAll<HTMLElement>('[data-cursor-hide="true"]')
    for (const target of targets) {
      const rect = target.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      if (pointToRectDistance(x, y, rect) <= CURSOR_HIDE_DISTANCE) {
        return true
      }
    }
    return false
  }, [])

  const endRailDrag = useCallback(
    (pointerId: number) => {
      const drag = railDrag.current
      if (!drag.active || drag.pointerId !== pointerId) return
      const rail = railRef.current
      if (rail?.hasPointerCapture(pointerId)) {
        rail.releasePointerCapture(pointerId)
      }
      const releaseVel = drag.moved ? drag.velocity : 0
      if (drag.moved) {
        lastRailDragAt.current = Date.now()
      }
      railDrag.current = {
        active: false,
        pointerId: -1,
        startX: 0,
        startScrollLeft: 0,
        moved: false,
        lastClientX: 0,
        lastTime: 0,
        velocity: 0,
      }
      setIsRailDragging(false)
      if (
        rail &&
        Math.abs(releaseVel * RAIL_MOMENTUM_BOOST) >= RAIL_MOMENTUM_MIN_VELOCITY
      ) {
        startRailMomentum(rail, releaseVel)
      }
    },
    [startRailMomentum],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInfoOpen) {
        e.preventDefault()
        closeInfo()
        return
      }

      if (e.key.toLowerCase() === 'i') {
        e.preventDefault()
        toggleInfo()
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrevProject()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNextProject()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        showRail()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        hideRail()
      } else if (e.key === 'Home') {
        e.preventDefault()
        selectProject(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        selectProject(projects.length - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeInfo, goPrevProject, goNextProject, hideRail, isInfoOpen, selectProject, showRail, toggleInfo])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const { x: px, y: py } = wheelPixels(e)
      const ax = Math.abs(px)
      const ay = Math.abs(py)
      if (ax < 0.5 && ay < 0.5) return

      const targetNode = e.target instanceof Node ? e.target : null
      const isOnRail = targetNode ? railWrapRef.current?.contains(targetNode) : false
      const isOnProjectItemsZone =
        !!targetNode &&
        (stageWrapRef.current?.contains(targetNode) === true || stageHitRef.current?.contains(targetNode) === true)

      if (isOnRail && !isRailHidden) {
        const horizontalIntent =
          (ax >= RAIL_WHEEL_X_MIN && ax >= ay * RAIL_HORIZONTAL_RATIO) ||
          (e.shiftKey && ay >= RAIL_WHEEL_X_MIN)

        if (horizontalIntent) {
          const rail = railRef.current
          if (!rail) return
          feedRailGapWheelImpulse(Math.hypot(ax, ay))
          // Keep native inertial scrolling for trackpads; only convert Shift+wheel.
          if (e.shiftKey && ay > ax) {
            e.preventDefault()
            rail.scrollLeft += py
          }
          infoWheelAcc.current = 0
          wheelAcc.current = { y: 0 }
          return
        }

        // Ignore slight diagonal noise over the rail so it does not jitter-hide.
        if (ay < ax * VERTICAL_INTENT_RATIO) return
      }

      const horizontalIntent = ax > ay
      if (isOnProjectItemsZone && horizontalIntent) {
        e.preventDefault()
        infoWheelAcc.current += px
        if (Math.abs(infoWheelAcc.current) < INFO_WHEEL_STEP) return

        const towardOpen = infoWheelAcc.current > 0
        infoWheelAcc.current = 0
        if (towardOpen && !isInfoOpen) {
          openInfo()
        } else if (!towardOpen && isInfoOpen) {
          closeInfo()
        }
        return
      }

      if (ay <= ax * VERTICAL_INTENT_RATIO) return

      e.preventDefault()
      infoWheelAcc.current = 0
      wheelAcc.current.y += py
      const towardShow = wheelAcc.current.y > 0
      const step = towardShow ? RAIL_WHEEL_SHOW_EARLY : WHEEL_STEP
      if (Math.abs(wheelAcc.current.y) < step) return

      wheelAcc.current = { y: 0 }
      if (towardShow) {
        showRail()
      } else {
        if (isInfoOpen) {
          closeInfo({ hideRail: true })
        } else {
          hideRail()
        }
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [closeInfo, feedRailGapWheelImpulse, hideRail, isInfoOpen, isRailHidden, openInfo, showRail])

  useEffect(() => {
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!finePointerQuery.matches) return

    const updateCursorUi = (patch: Partial<CursorUiState>) => {
      const current = cursorUiRef.current
      const next: CursorUiState = {
        zone: patch.zone ?? current.zone,
        direction: patch.direction ?? current.direction,
        idle: patch.idle ?? current.idle,
        proximityHidden: patch.proximityHidden ?? current.proximityHidden,
      }
      if (
        next.zone === current.zone &&
        next.direction === current.direction &&
        next.idle === current.idle &&
        next.proximityHidden === current.proximityHidden
      ) {
        return
      }
      cursorUiRef.current = next
      setCursorUi(next)
    }

    const resetIdleTimer = () => {
      if (cursorIdleTimer.current !== null) {
        window.clearTimeout(cursorIdleTimer.current)
      }
      cursorIdleTimer.current = window.setTimeout(() => {
        const current = cursorUiRef.current
        if (current.zone === 'none' || current.proximityHidden) return
        updateCursorUi({ idle: true })
      }, CURSOR_IDLE_MS)
    }

    const onPointerMove = (e: PointerEvent) => {
      const cursorEl = cursorElRef.current
      if (cursorEl) {
        cursorEl.style.left = `${e.clientX}px`
        cursorEl.style.top = `${e.clientY}px`
      }

      const target = e.target instanceof Node ? e.target : null
      const onStage =
        !!target &&
        (stageWrapRef.current?.contains(target) === true || stageHitRef.current?.contains(target) === true)
      const onRail = !!target && railWrapRef.current?.contains(target) === true

      let zone: CursorZone = 'none'
      if (onStage) zone = 'stage'
      else if (onRail) zone = 'rail'

      let direction: CursorDirection = cursorUiRef.current.direction
      if (zone === 'stage') {
        const rect = stageWrapRef.current?.getBoundingClientRect()
        const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2
        direction = e.clientX < centerX ? 'left' : 'right'
      } else if (zone === 'rail') {
        direction = 'drag'
      }

      const proximityHidden = zone === 'none' ? false : isNearCursorHideTarget(e.clientX, e.clientY)
      updateCursorUi({
        zone,
        direction,
        idle: false,
        proximityHidden,
      })

      if (zone === 'none') {
        if (cursorIdleTimer.current !== null) {
          window.clearTimeout(cursorIdleTimer.current)
          cursorIdleTimer.current = null
        }
        return
      }
      resetIdleTimer()
    }

    const onPointerLeaveWindow = (e: MouseEvent) => {
      if (e.relatedTarget) return
      updateCursorUi({
        zone: 'none',
        idle: false,
        proximityHidden: false,
      })
      setIsCursorPressed(false)
      if (cursorIdleTimer.current !== null) {
        window.clearTimeout(cursorIdleTimer.current)
        cursorIdleTimer.current = null
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      if (cursorUiRef.current.zone === 'none') return
      setIsCursorPressed(true)
    }

    const onPointerUp = () => {
      setIsCursorPressed(false)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('mouseout', onPointerLeaveWindow)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    window.addEventListener('blur', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('mouseout', onPointerLeaveWindow)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('blur', onPointerUp)
      if (cursorIdleTimer.current !== null) {
        window.clearTimeout(cursorIdleTimer.current)
        cursorIdleTimer.current = null
      }
    }
  }, [isNearCursorHideTarget])

  useEffect(() => {
    const el = cardRefs.current[projectIndex]
    if (!el) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior =
      reduceMotion || !railInitialScrollDone.current ? 'auto' : 'smooth'
    railInitialScrollDone.current = true
    el.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
  }, [projectIndex])

  useLayoutEffect(() => {
    if (isRailHidden) {
      setRailStagger({ ready: false, stagger: [], visible: [] })
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const n = projects.length
      setRailStagger({
        ready: true,
        stagger: Array.from({ length: n }, (_, i) => i),
        visible: Array<boolean>(n).fill(true),
      })
      return
    }

    let cancelled = false
    const raf = requestAnimationFrame(() => {
      if (cancelled) return
      const rail = railRef.current
      if (!rail) return
      const railRect = rail.getBoundingClientRect()
      const n = projects.length
      const stagger = new Array<number>(n).fill(0)
      const visible = new Array<boolean>(n).fill(false)
      const items: { i: number; left: number }[] = []

      for (let i = 0; i < n; i++) {
        const el = cardRefs.current[i]
        if (!el) continue
        const r = el.getBoundingClientRect()
        const pad = 2
        if (r.width > 0 && r.right > railRect.left + pad && r.left < railRect.right - pad) {
          visible[i] = true
          items.push({ i, left: r.left })
        }
      }
      items.sort((a, b) => a.left - b.left)
      items.forEach((item, order) => {
        stagger[item.i] = order
      })

      setRailStagger({ ready: true, stagger, visible })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [isRailHidden, projects.length])

  useEffect(() => {
    if (USE_COLOR_MEDIA_PLACEHOLDERS) return
    const nextAsset = gallery[(assetIndex + 1) % gallery.length]
    const previousAsset = gallery[(assetIndex - 1 + gallery.length) % gallery.length]
    const preload = [nextAsset, previousAsset]
    for (const entry of preload) {
      if (!entry || entry.kind !== 'image') continue
      const image = new Image()
      image.src = entry.src
    }
  }, [assetIndex, gallery])

  useEffect(() => {
    if (!canStep) return
    const timer = window.setTimeout(() => {
      goNext()
    }, STORY_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [assetIndex, canStep, goNext, projectIndex])

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLElement>) => {
    if (e.touches.length !== 1) return
    const target = e.target as Node
    if (railWrapRef.current?.contains(target)) return
    const inProjectItemsZone =
      stageWrapRef.current?.contains(target) === true || stageHitRef.current?.contains(target) === true
    if (!inProjectItemsZone) return
    const touch = e.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    railTouchRevealStarted.current = false
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (!isRailHidden || railTouchRevealStarted.current) return
      if (e.touches.length !== 1) return
      const target = e.target as Node
      if (railWrapRef.current?.contains(target)) return
      const inProjectItemsZone =
        stageWrapRef.current?.contains(target) === true || stageHitRef.current?.contains(target) === true
      if (!inProjectItemsZone) return
      const start = touchStart.current
      if (!start) return
      const touch = e.touches[0]
      const deltaY = touch.clientY - start.y
      if (deltaY > RAIL_TOUCH_SHOW_PX) {
        railTouchRevealStarted.current = true
        showRail()
      }
    },
    [isRailHidden, showRail],
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      const start = touchStart.current
      touchStart.current = null
      if (!start || e.changedTouches.length === 0) return
      if (railWrapRef.current?.contains(e.target as Node)) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)
      if (Math.max(absX, absY) < SWIPE_STEP) return

      if (absX > absY) {
        if (!isInfoOpen && deltaX > SWIPE_STEP) {
          openInfo()
          return
        }

        if (isInfoOpen && deltaX < -SWIPE_STEP) {
          closeInfo()
          return
        }
      } else {
        if (deltaY < 0) {
          if (isInfoOpen) {
            closeInfo({ hideRail: true })
          } else {
            hideRail()
          }
        } else {
          showRail()
        }
      }
    },
    [closeInfo, hideRail, isInfoOpen, openInfo, showRail],
  )

  const handleRailPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isRailHidden) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const rail = railRef.current
      if (!rail) return
      cancelRailMomentum()
      railDrag.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: rail.scrollLeft,
        moved: false,
        lastClientX: e.clientX,
        lastTime: 0,
        velocity: 0,
      }
    },
    [cancelRailMomentum, isRailHidden],
  )

  const handleRailPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = railDrag.current
    if (!drag.active || drag.pointerId !== e.pointerId) return
    const rail = railRef.current
    if (!rail) return

    const deltaX = e.clientX - drag.startX
    if (!drag.moved && Math.abs(deltaX) < DRAG_START_PX) {
      return
    }

    if (!drag.moved) {
      drag.moved = true
      setIsRailDragging(true)
      rail.setPointerCapture(e.pointerId)
      drag.lastClientX = e.clientX
      drag.lastTime = performance.now()
      drag.velocity = 0
    } else {
      const now = performance.now()
      const dt = now - drag.lastTime
      if (dt > 0 && drag.lastTime > 0) {
        const inst = -(e.clientX - drag.lastClientX) / dt
        drag.velocity =
          RAIL_VELOCITY_SMOOTH * inst + (1 - RAIL_VELOCITY_SMOOTH) * drag.velocity
      }
      drag.lastClientX = e.clientX
      drag.lastTime = now
    }

    rail.scrollLeft = drag.startScrollLeft - deltaX
  }, [])

  const handleRailPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endRailDrag(e.pointerId)
    },
    [endRailDrag],
  )

  const handleRailPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      endRailDrag(e.pointerId)
    },
    [endRailDrag],
  )

  const handleRailPointerLeave = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = railDrag.current
    if (!drag.active || drag.pointerId !== e.pointerId || drag.moved) return
    railDrag.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
      lastClientX: 0,
      lastTime: 0,
      velocity: 0,
    }
  }, [])

  const stageLabel = useMemo(() => {
    if (!canStep) return `${project.label} — 1 / 1`
    return `${project.label} — ${assetIndex + 1} / ${gallery.length}`
  }, [assetIndex, canStep, gallery.length, project.label])

  const projectCode = useMemo(() => project.id.replace(/[-_]/g, ' '), [project.id])
  const cursorGlyph = cursorUi.direction === 'left' ? '←' : cursorUi.direction === 'right' ? '→' : '↔'
  const cursorClassName = [
    'customCursor',
    cursorUi.zone !== 'none' ? 'customCursor--visible' : '',
    isCursorPressed ? 'customCursor--pressed' : '',
    cursorUi.idle ? 'customCursor--idle' : '',
    cursorUi.proximityHidden ? 'customCursor--proximity' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={`shell ${isInfoOpen ? 'shell--info' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="fullBleed">
        <section
          className="stageMediaWrap"
          ref={stageWrapRef}
          aria-label={`Project preview for ${project.label}`}
        >
          <div className="stageMedia">
            {asset && (
              <MediaView key={`${project.id}-${assetIndex}`} media={asset} fit="cover" className="stageFill" />
            )}
          </div>
        </section>

        <aside id="project-info-panel" className="projectInfoPanel" aria-hidden={!isInfoOpen}>
          <p className="projectInfoKicker">{projectCode}</p>
          <h2 className="projectInfoTitle">{project.label}</h2>
          <p className="projectInfoBody">
            Visual direction, pacing, and narrative for this project. The stage keeps auto-playing through assets
            while you inspect context on the side.
          </p>
          <div className="projectFacts">
            <p className="projectFact">
              <span className="projectFactLabel">Assets</span>
              <span className="projectFactValue">{gallery.length}</span>
            </p>
            <p className="projectFact">
              <span className="projectFactLabel">Project</span>
              <span className="projectFactValue">
                {projectIndex + 1} / {projects.length}
              </span>
            </p>
            <p className="projectFact">
              <span className="projectFactLabel">Mode</span>
              <span className="projectFactValue">Auto story loop</span>
            </p>
          </div>
        </aside>
      </div>

      {canStep && (
        <div className="hitOverlay" ref={stageHitRef}>
          <button
            type="button"
            className="hit hitLeft"
            onClick={goPrev}
            aria-label="Previous project file"
          />
          <button
            type="button"
            className="hit hitRight"
            onClick={goNext}
            aria-label="Next project file"
          />
        </div>
      )}

      <header className="topBar">
        <p className="identity">Franek Fuks, Designer</p>

        <div className="storyMeter" aria-hidden>
          {gallery.map((_, i) => {
            const done = i < assetIndex
            const active = i === assetIndex
            return (
              <span
                key={`${project.id}-story-${i}`}
                className={`storySegment ${active ? 'storySegment--active' : ''} ${done ? 'storySegment--done' : ''}`}
              >
                <span
                  className={`storyFill ${done ? 'storyFill--done' : ''} ${active ? 'storyFill--active' : ''}`}
                  style={active ? { animationDuration: `${STORY_DURATION_MS}ms` } : undefined}
                />
              </span>
            )
          })}
        </div>

        <div className="topRight">
          <span className="projectTitle">{project.label}</span>
          <button
            type="button"
            className="infoButton"
            data-cursor-hide="true"
            aria-label={isInfoOpen ? 'Close information panel' : 'Open information panel'}
            aria-expanded={isInfoOpen}
            aria-controls="project-info-panel"
            onClick={toggleInfo}
          >
            {isInfoOpen ? 'Close' : 'Info'}
          </button>
        </div>
      </header>

      <footer
        className="railWrap"
        ref={railWrapRef}
        data-hidden={isRailHidden}
        data-dragging={isRailDragging}
      >
        <p className={`railHint ${isRailHidden ? 'railHint--visible' : ''}`} aria-hidden={!isRailHidden}>
          Swipe up to see projects
        </p>
        <div
          className="rail"
          ref={railRef}
          data-stagger-ready={railStagger.ready}
          onPointerDown={handleRailPointerDown}
          onPointerMove={handleRailPointerMove}
          onPointerUp={handleRailPointerUp}
          onPointerCancel={handleRailPointerCancel}
          onPointerLeave={handleRailPointerLeave}
        >
          <div className="railTrack" ref={railTrackRef} role="list">
            {projects.map((p, i) => {
              const open = i === projectIndex
              return (
                <button
                  key={p.id}
                  type="button"
                  role="listitem"
                  data-cursor-hide="true"
                  ref={(node) => {
                    cardRefs.current[i] = node
                  }}
                  className={`card ${open ? 'card--open' : 'card--default'}`}
                  data-rail-enter={
                    railStagger.ready ? (railStagger.visible[i] ? 'on' : 'off') : undefined
                  }
                  style={
                    {
                      '--card-stagger': railStagger.ready ? railStagger.stagger[i] ?? 0 : 0,
                      '--card-rest-scale': 0.95,
                    } as React.CSSProperties
                  }
                  data-state={open ? 'open' : 'default'}
                  onClick={() => {
                    if (Date.now() - lastRailDragAt.current < DRAG_CLICK_SUPPRESS_MS) return
                    selectProject(i)
                  }}
                  aria-current={open ? 'true' : undefined}
                  aria-label={`${p.label}${open ? ', current project' : ''}`}
                >
                  <div className="thumb">
                    <MediaView media={p.cover} fit="cover" className="thumbMedia" variant="thumb" />
                    <span className="cardLabel">{p.label}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </footer>

      <div ref={cursorElRef} className={cursorClassName} data-zone={cursorUi.zone} aria-hidden>
        <span className="customCursorIcon">{cursorGlyph}</span>
      </div>

      <p className="visuallyHidden" aria-live="polite">
        {stageLabel}
      </p>
    </div>
  )
}
