<!-- Exported snapshot: Web Animation Design (Emil Kowalski / animations.dev). Source: ~/.cursor/skills/web-animation-design/ -->

# Web Animation Design

A comprehensive guide for creating animations that feel right, based on Emil Kowalski's "Animations on the Web" course.

## Initial Response

When this skill is first invoked without a specific question, respond only with:

> I'm ready to help you with animations based on Emil Kowalski's animations.dev course.

Do not provide any other information until the user asks a question.

## Review Format (Required)

When reviewing animations, you MUST use a markdown table. Do NOT use a list with "Before:" and "After:" on separate lines. Always output an actual markdown table like this:

| Before                            | After                                           |
| --------------------------------- | ----------------------------------------------- |
| `transform: scale(0)`             | `transform: scale(0.95)`                        |
| `animation: fadeIn 400ms ease-in` | `animation: fadeIn 200ms ease-out`              |
| No reduced motion support         | `@media (prefers-reduced-motion: reduce) {...}` |

Wrong format (never do this):

```
Before: transform: scale(0)
After: transform: scale(0.95)
────────────────────────────
Before: 400ms duration
After: 200ms
```

Correct format: A single markdown table with | Before | After | columns, one row per issue.

## Quick Start

Every animation decision starts with these questions:

1. **Is this element entering or exiting?** → Use `ease-out`
2. **Is an on-screen element moving?** → Use `ease-in-out`
3. **Is this a hover/color transition?** → Use `ease`
4. **Will users see this 100+ times daily?** → Don't animate it

## The Easing Blueprint

### ease-out (Most Common)

Use for **user-initiated interactions**: dropdowns, modals, tooltips, any element entering or exiting the screen.

```css
/* Sorted weak to strong */
--ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-out-cubic: cubic-bezier(0.215, 0.61, 0.355, 1);
--ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
--ease-out-quint: cubic-bezier(0.23, 1, 0.32, 1);
--ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
--ease-out-circ: cubic-bezier(0.075, 0.82, 0.165, 1);
```

Why it works: Acceleration at the start creates an instant, responsive feeling. The element "jumps" toward its destination then settles in.

### ease-in-out (For Movement)

Use when **elements already on screen need to move or morph**. Mimics natural motion like a car accelerating then braking.

```css
/* Sorted weak to strong */
--ease-in-out-quad: cubic-bezier(0.455, 0.03, 0.515, 0.955);
--ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1);
--ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);
--ease-in-out-quint: cubic-bezier(0.86, 0, 0.07, 1);
--ease-in-out-expo: cubic-bezier(1, 0, 0, 1);
--ease-in-out-circ: cubic-bezier(0.785, 0.135, 0.15, 0.86);
```

### ease (For Hover Effects)

Use for **hover states and color transitions**. The asymmetrical curve (faster start, slower end) feels elegant for gentle animations.

```css
transition: background-color 150ms ease;
```

### linear (Avoid in UI)

Only use for:

- Constant-speed animations (marquees, tickers)
- Time visualization (hold-to-delete progress indicators)

Linear feels robotic and unnatural for interactive elements.

### ease-in (Almost Never)

**Avoid for UI animations.** Makes interfaces feel sluggish because the slow start delays visual feedback.

### Paired Elements Rule

Elements that animate together must use the same easing and duration. Modal + overlay, tooltip + arrow, drawer + backdrop—if they move as a unit, they should feel like a unit.

```css
/* Both use the same timing */
.modal {
  transition: transform 200ms ease-out;
}
.overlay {
  transition: opacity 200ms ease-out;
}
```

## Timing and Duration

## Duration Guidelines

| Element Type                      | Duration  |
| --------------------------------- | --------- |
| Micro-interactions                | 100-150ms |
| Standard UI (tooltips, dropdowns) | 150-250ms |
| Modals, drawers                   | 200-300ms |

**Rules:**

- UI animations should stay under 300ms
- Larger elements animate slower than smaller ones
- Exit animations can be ~20% faster than entrance
- Match duration to distance - longer travel = longer duration

### The Frequency

Determine how often users will see the animation:

- **100+ times/day** → No animation (or drastically reduced)
- **Occasional use** → Standard animation
- **Rare/first-time** → Can be more special

**Example:** Raycast never animates because users open it hundreds of times a day.

## When to Animate

**Do animate:**

- Enter/exit transitions for spatial consistency
- State changes that benefit from visual continuity
- Responses to user actions (feedback)
- Rarely-used interactions where delight adds value

**Don't animate:**

- Keyboard-initiated actions
- Hover effects on frequently-used elements
- Anything users interact with 100+ times daily
- When speed matters more than smoothness

**Marketing vs. Product:**

- Marketing: More elaborate, longer durations allowed
- Product: Fast, purposeful, never frivolous

## Spring Animations

Springs feel more natural because they don't have fixed durations—they simulate real physics.

### When to Use Springs

- Drag interactions with momentum
- Elements that should feel "alive" (Dynamic Island)
- Gestures that can be interrupted mid-animation
- Organic, playful interfaces

### Configuration

**Apple's approach (recommended):**

```js
// Duration + bounce (easier to understand)
{ type: "spring", duration: 0.5, bounce: 0.2 }
```

**Traditional physics:**

```js
// Mass, stiffness, damping (more complex)
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

### Bounce Guidelines

- **Avoid bounce** in most UI contexts
- **Use bounce** for drag-to-dismiss, playful interactions
- Keep bounce subtle (0.1-0.3) when used

### Interruptibility

Springs maintain velocity when interrupted—CSS animations restart from zero. This makes springs ideal for gestures users might change mid-motion.

## Performance

### The Golden Rule

Only animate `transform` and `opacity`. These skip layout and paint stages, running entirely on the GPU.

**Avoid animating:**

- `padding`, `margin`, `height`, `width` (trigger layout)
- `blur` filters above 20px (expensive, especially Safari)
- CSS variables in deep component trees

### Optimization Techniques

```css
/* Force GPU acceleration */
.animated-element {
  will-change: transform;
}
```

**React-specific:**

- Animate outside React's render cycle when possible
- Use refs to update styles directly instead of state
- Re-renders on every frame = dropped frames

**Framer Motion:**

```jsx
// Hardware accelerated (transform as string)
<motion.div animate={{ transform: "translateX(100px)" }} />

// NOT hardware accelerated (more readable)
<motion.div animate={{ x: 100 }} />
```

### CSS vs. JavaScript

- CSS animations run off main thread (smoother under load)
- JS animations (Framer Motion, React Spring) use `requestAnimationFrame`
- CSS better for simple, predetermined animations
- JS better for dynamic, interruptible animations

## Accessibility

Animations can cause motion sickness or distraction for some users.

### prefers-reduced-motion

Whenever you add an animation, also add a media query to disable it:

```css
.modal {
  animation: fadeIn 200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .modal {
    animation: none;
  }
}
```

### Reduced Motion Guidelines

- Every animated element needs its own `prefers-reduced-motion` media query
- Set `animation: none` or `transition: none` (no `!important`)
- No exceptions for opacity or color - disable all animations
- Show play buttons instead of autoplay videos

### Framer Motion Implementation

```jsx
import { useReducedMotion } from "framer-motion";

function Component() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    />
  );
}
```

### Touch Device Considerations

```css
/* Disable hover animations on touch devices */
@media (hover: hover) and (pointer: fine) {
  .element:hover {
    transform: scale(1.05);
  }
}
```

Touch devices trigger hover on tap, causing false positives.

## Practical Tips

Quick reference for common scenarios. For expanded guidance, see [Detailed implementations](#detailed-implementations) below.

| Scenario                        | Solution                                        |
| ------------------------------- | ----------------------------------------------- |
| Make buttons feel responsive    | Add `transform: scale(0.97)` on `:active`       |
| Element appears from nowhere    | Start from `scale(0.95)`, not `scale(0)`        |
| Shaky/jittery animations        | Add `will-change: transform`                    |
| Hover causes flicker            | Animate child element, not parent               |
| Popover scales from wrong point | Set `transform-origin` to trigger location      |
| Sequential tooltips feel slow   | Skip delay/animation after first tooltip        |
| Small buttons hard to tap       | Use 44px minimum hit area (pseudo-element)      |
| Something still feels off       | Add subtle blur (under 20px) to mask it         |
| Hover triggers on mobile        | Use `@media (hover: hover) and (pointer: fine)` |

## Easing Decision Flowchart

Is the element entering or exiting the viewport?
├── Yes → ease-out
└── No
├── Is it moving/morphing on screen?
│ └── Yes → ease-in-out
└── Is it a hover change?
├── Yes → ease
└── Is it constant motion?
├── Yes → linear
└── Default → ease-out

---

## Detailed implementations

### Practical Animation Tips

Detailed reference guide for common animation scenarios. Use this as a checklist when implementing animations.

### Recording & Debugging

#### Record Your Animations

When something feels off but you can't identify why, record the animation and play it back frame by frame. This reveals details invisible at normal speed.

#### Fix Shaky Animations

Elements may shift by 1px at the start/end of CSS transform animations due to GPU/CPU rendering handoff.

**Fix:**

```css
.element {
  will-change: transform;
}
```

This tells the browser to keep the element on the GPU throughout the animation.

#### Take Breaks

Don't code and ship animations in one sitting. Step away, return with fresh eyes. The best animations are reviewed and refined over days, not hours.

### Button & Click Feedback

#### Scale Buttons on Press

Make interfaces feel responsive by adding subtle scale feedback:

```css
button:active {
  transform: scale(0.97);
}
```

This gives instant visual feedback that the interface is listening.

#### Don't Animate from scale(0)

Starting from `scale(0)` makes elements appear from nowhere—it feels unnatural.

**Bad:**

```css
.element {
  transform: scale(0);
}
.element.visible {
  transform: scale(1);
}
```

**Good:**

```css
.element {
  transform: scale(0.95);
  opacity: 0;
}
.element.visible {
  transform: scale(1);
  opacity: 1;
}
```

Elements should always have some visible shape, like a deflated balloon.

### Tooltips & Popovers

#### Skip Animation on Subsequent Tooltips

First tooltip: delay + animation. Subsequent tooltips (while one is open): instant, no delay.

```css
.tooltip {
  transition:
    transform 125ms ease-out,
    opacity 125ms ease-out;
  transform-origin: var(--transform-origin);
}

.tooltip[data-starting-style],
.tooltip[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}

/* Skip animation for subsequent tooltips */
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

Radix UI and Base UI support this pattern with `data-instant` attribute.

#### Make Animations Origin-Aware

Popovers should scale from their trigger, not from center.

```css
/* Default (wrong for most cases) */
.popover {
  transform-origin: center;
}

/* Correct - scale from trigger */
.popover {
  transform-origin: var(--transform-origin);
}
```

**Radix UI:**

```css
.popover {
  transform-origin: var(--radix-dropdown-menu-content-transform-origin);
}
```

**Base UI:**

```css
.popover {
  transform-origin: var(--transform-origin);
}
```

### Speed & Timing

#### Keep Animations Fast

A faster-spinning spinner makes apps feel faster even with identical load times. A 180ms select animation feels more responsive than 400ms.

**Rule:** UI animations should stay under 300ms.

#### Don't Animate Keyboard Interactions

Arrow key navigation, keyboard shortcuts—these are repeated hundreds of times daily. Animation makes them feel slow and disconnected.

**Never animate:**

- List navigation with arrow keys
- Keyboard shortcut responses
- Tab/focus movements

#### Be Careful with Frequently-Used Elements

A hover effect is nice, but if triggered multiple times a day, it may benefit from no animation at all.

**Guideline:** Use your own product daily. You'll discover which animations become annoying through repeated use.

### Hover States

#### Fix Hover Flicker

When hover animation changes element position, the cursor may leave the element, causing flicker.

**Problem:**

```css
.box:hover {
  transform: translateY(-20%);
}
```

**Solution:** Animate a child element instead:

```html
<div class="box">
  <div class="box-inner"></div>
</div>
```

```css
.box:hover .box-inner {
  transform: translateY(-20%);
}

.box-inner {
  transition: transform 200ms ease;
}
```

The parent's hover area stays stable while the child moves.

#### Disable Hover on Touch Devices

Touch devices don't have true hover. Accidental finger movement triggers unwanted hover states.

```css
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    transform: scale(1.05);
  }
}
```

**Note:** Tailwind v4's `hover:` class automatically applies only when the device supports hover.

### Touch & Accessibility

#### Ensure Appropriate Target Areas

Small buttons are hard to tap. Use a pseudo-element to create larger hit areas without changing layout.

**Minimum target:** 44px (Apple and WCAG recommendation)

```css
@utility touch-hitbox {
  position: relative;
}

@utility touch-hitbox::before {
  content: "";
  position: absolute;
  display: block;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  height: 100%;
  min-height: 44px;
  min-width: 44px;
  z-index: 9999;
}
```

Usage:

```jsx
<button className="touch-hitbox">
  <BellIcon />
</button>
```

### Easing Selection

#### Use ease-out for Enter/Exit

Elements entering or exiting should use `ease-out`. The fast start creates responsiveness.

```css
.dropdown {
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;
}
```

`ease-in` starts slow—wrong for UI. Same duration feels slower because the movement is back-loaded.

#### Use ease-in-out for On-Screen Movement

Elements already visible that need to move should use `ease-in-out`. Mimics natural acceleration/deceleration like a car.

```css
.slider-handle {
  transition: transform 250ms ease-in-out;
}
```

#### Use Custom Easing Curves

Built-in CSS curves are usually too weak. Custom curves create more intentional motion.

**Resources:**

- Course reference: `/learn/easing-curves`
- External: [easings.co](https://easings.co/)

### Visual Tricks

#### Use Blur as a Fallback

When easing and timing adjustments don't solve the problem, add subtle blur to mask imperfections.

```css
.button-transition {
  transition:
    transform 150ms ease-out,
    filter 150ms ease-out;
}

.button-transition:active {
  transform: scale(0.97);
  filter: blur(2px);
}
```

Blur bridges visual gaps between states, tricking the eye into seeing smoother transitions. The two states blend instead of appearing as distinct objects.

**Performance note:** Keep blur under 20px, especially on Safari.

### Why Details Matter

> "All those unseen details combine to produce something that's just stunning, like a thousand barely audible voices all singing in tune."
> — Paul Graham, Hackers and Painters

Details that go unnoticed are good—users complete tasks without friction. Great interfaces enable users to achieve goals with ease, not to admire animations.
