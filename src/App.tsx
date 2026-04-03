import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Media } from './data/projects'
import { projects } from './data/projects'
import './App.css'

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
const SWIPE_STEP = 42
const RAIL_WHEEL_X_MIN = 1.5
const RAIL_HORIZONTAL_RATIO = 0.65
const VERTICAL_INTENT_RATIO = 1.12
const DRAG_CLICK_SUPPRESS_MS = 220
const DRAG_START_PX = 8
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
  const [isRailHidden, setIsRailHidden] = useState(true)
  const [isRailDragging, setIsRailDragging] = useState(false)
  const [isCursorPressed, setIsCursorPressed] = useState(false)
  const [cursorUi, setCursorUi] = useState<CursorUiState>({
    zone: 'none',
    direction: 'right',
    idle: false,
    proximityHidden: false,
  })
  const wheelAcc = useRef({ y: 0 })
  const touchStart = useRef<{ x: number; y: number } | null>(null)
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

  const hideRail = useCallback(() => {
    setIsRailHidden(true)
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
    }
    setIsRailDragging(false)
  }, [])

  const showRail = useCallback(() => {
    setIsRailHidden(false)
  }, [])

  useEffect(() => {
    cursorUiRef.current = cursorUi
  }, [cursorUi])

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

  const endRailDrag = useCallback((pointerId: number) => {
    const drag = railDrag.current
    if (!drag.active || drag.pointerId !== pointerId) return
    const rail = railRef.current
    if (rail?.hasPointerCapture(pointerId)) {
      rail.releasePointerCapture(pointerId)
    }
    if (drag.moved) {
      lastRailDragAt.current = Date.now()
    }
    railDrag.current = {
      active: false,
      pointerId: -1,
      startX: 0,
      startScrollLeft: 0,
      moved: false,
    }
    setIsRailDragging(false)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInfoOpen) {
        e.preventDefault()
        setIsInfoOpen(false)
        return
      }

      if (e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setIsInfoOpen((open) => !open)
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
  }, [goPrevProject, goNextProject, hideRail, isInfoOpen, selectProject, showRail])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const { x: px, y: py } = wheelPixels(e)
      const ax = Math.abs(px)
      const ay = Math.abs(py)
      if (ax < 0.5 && ay < 0.5) return

      const targetNode = e.target instanceof Node ? e.target : null
      const isOnRail = targetNode ? railWrapRef.current?.contains(targetNode) : false

      if (isOnRail && !isRailHidden) {
        const horizontalIntent =
          (ax >= RAIL_WHEEL_X_MIN && ax >= ay * RAIL_HORIZONTAL_RATIO) ||
          (e.shiftKey && ay >= RAIL_WHEEL_X_MIN)

        if (horizontalIntent) {
          const rail = railRef.current
          if (!rail) return
          // Keep native inertial scrolling for trackpads; only convert Shift+wheel.
          if (e.shiftKey && ay > ax) {
            e.preventDefault()
            rail.scrollLeft += py
          }
          wheelAcc.current = { y: 0 }
          return
        }

        // Ignore slight diagonal noise over the rail so it does not jitter-hide.
        if (ay < ax * VERTICAL_INTENT_RATIO) return
      }

      if (ay <= ax * VERTICAL_INTENT_RATIO) return

      e.preventDefault()
      wheelAcc.current.y += py
      if (Math.abs(wheelAcc.current.y) < WHEEL_STEP) return

      const towardShow = wheelAcc.current.y > 0
      wheelAcc.current = { y: 0 }
      if (towardShow) {
        showRail()
      } else {
        hideRail()
      }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [hideRail, isRailHidden, showRail])

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

  useEffect(() => {
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
    if (railWrapRef.current?.contains(e.target as Node)) return
    const touch = e.touches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }, [])

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
        if (deltaX < 0) {
          goNext()
        } else {
          goPrev()
        }
      } else {
        if (deltaY < 0) {
          hideRail()
        } else {
          showRail()
        }
      }
    },
    [goNext, goPrev, hideRail, showRail],
  )

  const handleRailPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isRailHidden) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const rail = railRef.current
      if (!rail) return
      railDrag.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: rail.scrollLeft,
        moved: false,
      }
    },
    [isRailHidden],
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
    }
  }, [])

  const stageLabel = useMemo(() => {
    if (!canStep) return `${project.label} — 1 / 1`
    return `${project.label} — ${assetIndex + 1} / ${gallery.length}`
  }, [assetIndex, canStep, gallery.length, project.label])

  const projectCode = useMemo(() => project.id.replace(/[-_]/g, ' ').toUpperCase(), [project.id])
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
            onClick={() => setIsInfoOpen((open) => !open)}
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
          onPointerDown={handleRailPointerDown}
          onPointerMove={handleRailPointerMove}
          onPointerUp={handleRailPointerUp}
          onPointerCancel={handleRailPointerCancel}
          onPointerLeave={handleRailPointerLeave}
        >
          <div className="railTrack" role="list">
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
                  data-state={open ? 'open' : 'default'}
                  onClick={() => {
                    if (Date.now() - lastRailDragAt.current < DRAG_CLICK_SUPPRESS_MS) return
                    selectProject(i)
                  }}
                  aria-current={open ? 'true' : undefined}
                  aria-label={`${p.label}${open ? ', current project' : ''}`}
                >
                  <div className={`thumb thumb${(i % 4) + 1}`}>
                    <MediaView media={p.cover} fit="cover" className="thumbMedia" variant="thumb" />
                  </div>
                  <span className="cardLabel">{p.label}</span>
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
