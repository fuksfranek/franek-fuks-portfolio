---
name: interface-craft
description: "Interface Craft by Josh Puckett — a toolkit for building polished, animated interfaces in React. Includes Storyboard Animation (human-readable animation DSL with stage-driven sequencing), DialKit (live control panels for tuning animation values), and Design Critique (systematic UI review based on Josh Puckett's methodology). Triggers on: animate, animation, transition, storyboard, entrance, motion, spring, easing, timing, dialkit, sliders, controls, tune, tweak, critique, review, feedback, audit, improve, polish, refine, redesign."
argument-hint: "[description, file path, or sub-skill name]"
---

# Interface Craft

**By Josh Puckett**

A toolkit for building polished, animated interfaces. Write animations you can read like a script, then tune them with live controls.

---

## Skills

| Skill | When to Use | Invoke |
| --- | --- | --- |
| [Storyboard Animation](#storyboard-animation) | Writing or refactoring multi-stage animations into a human-readable DSL | `/interface-craft storyboard` or describe an animation |
| [DialKit](#dialkit) | Adding live control panels to tune animation/style values | `/interface-craft dialkit` or mention dials/sliders/controls |
| [Design Critique](#design-critique) | Systematic UI critique of a screenshot, component, or page | `/interface-craft critique` or paste a screenshot for review |

## Quick Start

### Storyboard Animation

Turn any animation into a readable storyboard with named timing, config objects, and stage-driven sequencing:

```tsx
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   waiting for scroll into view
 *  300ms   card fades in, scale 0.85 → 1.0
 *  900ms   heading highlights
 * 1500ms   rows slide up (staggered 200ms)
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  cardAppear:  300,   // card fades in
  heading:     900,   // heading highlights
  rows:        1500,  // rows start staggering
};
```

See [Storyboard Animation](#storyboard-animation) below for the full pattern spec.

### DialKit

Generate live control panels for tuning values in real time:

```tsx
const params = useDialKit('Card', {
  scale: [1, 0.5, 2],
  blur: [0, 0, 100],
  spring: { type: 'spring', visualDuration: 0.3, bounce: 0.2 },
})
```

See [DialKit](#dialkit) below for all control types and patterns.

## Sub-Skill Routing

When the user invokes `/interface-craft`:

1. **With `storyboard` argument or animation-related context** → Load and follow [Storyboard Animation](#storyboard-animation)
2. **With `dialkit` argument or control-panel-related context** → Load and follow [DialKit](#dialkit)
3. **With `critique` argument, a pasted image, or review-related context** → Load and follow [Design Critique](#design-critique)
4. **With a file path** → Read the file, detect whether it needs storyboard refactoring, dialkit controls, or a design critique, and apply the appropriate skill
5. **With a plain-English description of an animation** → Use storyboard-animation to write it
6. **Ambiguous** → Ask which skill to use

## Design Principles

1. **Readable over clever** — Anyone should be able to scan the top of a file and understand the animation sequence without reading implementation code
2. **Tunable by default** — Every value that affects timing or appearance should be a named constant, trivially adjustable
3. **Data-driven** — Repeated elements use arrays and `.map()`, not copy-pasted blocks
4. **Stage-driven** — A single integer state drives the entire sequence; no scattered boolean flags
5. **Spring-first** — Prefer spring physics over duration-based easing for natural motion

---

## Storyboard Animation


A pattern for writing and refactoring React animations into a human-readable storyboard format. Every timing value, scale, position, and spring config is extracted to named constants at the top of the file so you can read the animation like a script and tune any value instantly.


## When to use

- User says "animate", "transition", "entrance animation", "storyboard", etc.
- User pastes existing animation code and wants it cleaned up
- User describes a desired animation in plain English
- User points to a file with `motion.*` components that have inline timing/values

## The Storyboard Pattern

Every animated component follows this exact structure:

### 1. ASCII Storyboard Comment

A block comment at the top of the file that reads like a shot list. Anyone can scan it and understand the full sequence without reading code.

```
/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after trigger.
 *
 *    0ms   waiting for trigger (scroll into view / mount)
 *  300ms   card fades in, scale 0.85 → 1.0
 *  900ms   heading text highlights
 * 1500ms   detail rows slide up (staggered 200ms)
 * 2100ms   CTA button fades in
 * ───────────────────────────────────────────────────────── */
```

Rules for the storyboard comment:
- Right-align the ms values for scannability
- Use `→` to show value transitions (e.g. `scale 0.8 → 1.5`)
- Note stagger intervals in parentheses
- Keep descriptions short — one line per stage

### 2. TIMING Object

A single `const TIMING` object with every stage delay in milliseconds. This is the **only place** timing values live.

```tsx
const TIMING = {
  cardAppear:    300,   // card fades in and scales up
  headingGlow:   900,   // heading text highlights
  detailRows:    1500,  // rows start staggering in
  ctaButton:     2100,  // button fades in
};
```

Rules:
- Keys are `camelCase`, descriptive verb phrases
- Values are ms after the animation trigger (not deltas between stages)
- Every key gets an inline comment
- Align values and comments for readability

### 3. Element Config Objects

Each animated element (or group of elements) gets its own named config object with all its visual values and spring config.

```tsx
/* Card container */
const CARD = {
  initialScale: 0.85,   // scale before appearing
  finalScale:   1.0,     // resting scale
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
};

/* Detail rows */
const ROWS = {
  stagger:  0.2,   // seconds between each row
  offsetY:  12,    // px each row slides up from
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
  items: [
    { label: "Row 1", value: "A" },
    { label: "Row 2", value: "B" },
  ],
};
```

Rules:
- UPPERCASE name matching the element it controls
- Group ALL values for one element together — scales, positions, colors, springs
- Repeated items are arrays inside the config, rendered with `.map()`
- Spring configs live here, never inline in JSX
- Every value gets a short comment

### 4. Component Body

```tsx
export function MyFigure({ replayTrigger = 0 }: { replayTrigger?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isInView) { setStage(0); return; }

    setStage(0);
    const timers: NodeJS.Timeout[] = [];

    timers.push(setTimeout(() => setStage(1), TIMING.cardAppear));
    timers.push(setTimeout(() => setStage(2), TIMING.headingGlow));
    timers.push(setTimeout(() => setStage(3), TIMING.detailRows));
    timers.push(setTimeout(() => setStage(4), TIMING.ctaButton));

    return () => timers.forEach(clearTimeout);
  }, [isInView, replayTrigger]);

  return ( /* JSX using stage >= N and config values */ );
}
```

Rules:
- Single `stage` state integer (not multiple booleans)
- One `useEffect` with all `setTimeout` calls reading from `TIMING`
- Cleanup clears all timers
- `replayTrigger` prop in dependency array enables click-to-replay
- JSX references config objects: `CARD.initialScale`, not `0.85`
- Stage checks in animate: `stage >= 1 ? CARD.finalScale : CARD.initialScale`

### 5. JSX Pattern for `motion.*` Elements

```tsx
<motion.div
  initial={{
    opacity: 0,
    scale: CARD.initialScale,
  }}
  animate={{
    opacity: stage >= 1 ? 1 : 0,
    scale:   stage >= 1 ? CARD.finalScale : CARD.initialScale,
  }}
  transition={CARD.spring}
>
```

For staggered groups:
```tsx
{ROWS.items.map((item, i) => (
  <motion.div
    key={item.label}
    initial={{ opacity: 0, y: ROWS.offsetY }}
    animate={{
      opacity: stage >= 3 ? 1 : 0,
      y:       stage >= 3 ? 0 : ROWS.offsetY,
    }}
    transition={{ ...ROWS.spring, delay: i * ROWS.stagger }}
  >
    {item.label}
  </motion.div>
))}
```

---

## How to apply

### Refactoring existing code

When the user provides a file or code with animations:

1. **Read the code** and identify every animated element and its timing
2. **Extract** all magic numbers (delays, scales, positions, springs) into config objects
3. **Write the storyboard comment** describing the sequence in plain English
4. **Create the TIMING object** with all stage delays
5. **Create element config objects** grouping values by animated element
6. **Rewrite the component** using the stage pattern
7. **Replace repeated elements** with data-driven `.map()` where applicable

### Writing new animations from a description

When the user describes what they want:

1. **Parse the description** into discrete stages with approximate timing
2. **Write the storyboard comment first** — confirm the sequence with the user if unclear
3. **Define TIMING** with sensible defaults (300ms initial delay, 500-700ms between stages)
4. **Define element configs** with appropriate springs:
   - Cards/containers: `{ stiffness: 300, damping: 30 }` (smooth settle)
   - Pop-ins/badges: `{ stiffness: 500, damping: 25 }` (snappy)
   - Slides/entrances: `{ stiffness: 350, damping: 28 }` (balanced)
5. **Build the component** following the pattern above

### Quick checklist

Before finishing, verify:
- [ ] Storyboard comment at top matches the actual TIMING values
- [ ] Zero magic numbers in JSX or useEffect — everything references a const
- [ ] Springs defined in config objects, not inline
- [ ] Repeated elements use `.map()` over a data array
- [ ] Stage values in JSX are `>=` checks (allows stages to be additive)
- [ ] `replayTrigger` in the dependency array for dev/debug replay support

---

## DialKit


Generate DialKit configurations for React + Motion projects — live control panels for tuning animation and style values in real time.


## When to use

- User mentions DialKit, dials, sliders, controls, tune, tweak
- User wants a live UI to adjust animation parameters
- User says "add controls for..." or "let me tune..."

## Mode Detection

### Direct Mode
Triggers when user describes what they want with context:
- "use DialKit to give me sliders for blur and opacity"
- "add dialkit controls for scale, rotation, and a spring"
- "I need toggles and sliders for my card animation"

In direct mode, generate the config immediately based on the request.

### Guided Mode
Triggers when user invokes without specific context or asks for help:
- `/interface-craft dialkit`
- "help me set up dialkit"
- "walk me through adding dialkit"

In guided mode, ask 2-3 concise questions then generate.

## Setup Check

Before generating configs, verify DialKit is installed. If working in a project:

1. Check if `dialkit` is in package.json dependencies
2. If not installed, provide:
```bash
npm install dialkit motion
```

3. Check if DialRoot is set up in a layout file. If not, remind user:
```tsx
import { DialRoot } from 'dialkit'
import 'dialkit/styles.css'

// Add to your root layout:
<DialRoot position="top-right" />
```

## Guided Flow Questions

Keep it fast - 2-3 questions max:

1. **Component context**: "What component are you adding controls to? Share the code or describe what you're building."

2. **Property selection**: "What properties do you want to tweak? Common options:
   - **Visual**: blur, opacity, scale, borderRadius
   - **Position**: offsetX, offsetY, rotation
   - **Animation**: spring (with visualDuration/bounce controls)
   - **Interaction**: action buttons, toggles"

3. Generate with smart defaults - don't ask about ranges.

## Smart Defaults

Use these defaults for common properties (users can adjust in the panel):

| Property | Default | Min | Max | Step |
|----------|---------|-----|-----|------|
| blur | 0 | 0 | 100 | 1 |
| opacity | 1 | 0 | 1 | 0.01 |
| scale | 1 | 0.5 | 2 | 0.1 |
| rotation | 0 | -180 | 180 | 1 |
| offsetX | 0 | -100 | 100 | 1 |
| offsetY | 0 | -100 | 100 | 1 |
| borderRadius | 0 | 0 | 50 | 1 |
| shadowBlur | 16 | 0 | 48 | 1 |
| shadowOffsetY | 8 | 0 | 24 | 1 |
| gap | 16 | 0 | 48 | 1 |
| padding | 16 | 0 | 48 | 1 |

## Control Types

See [Appendix: DialKit `config-patterns.json`](#appendix-dialkit-config-patternsjson) for the full schema. Summary:

### 1. Slider (explicit range)
```tsx
blur: [24, 0, 100]  // [default, min, max]
```

### 2. Slider (auto-inferred)
```tsx
scale: 1.18  // auto-infers range based on value
```

### 3. Toggle
```tsx
visible: true
```

### 4. Spring (Time mode - simpler)
```tsx
spring: {
  type: 'spring',
  visualDuration: 0.3,
  bounce: 0.2,
}
```

### 5. Spring (Physics mode - more control)
```tsx
spring: {
  type: 'spring',
  stiffness: 200,
  damping: 25,
  mass: 1,
}
```

### 6. Action Button
```tsx
reset: { type: 'action' }
next: { type: 'action', label: 'Next Slide' }
```

### 7. Select Dropdown
```tsx
theme: {
  type: 'select',
  options: ['light', 'dark', 'system'],
  default: 'system',
}
```

### 8. Color Picker
```tsx
backgroundColor: { type: 'color', default: '#3b82f6' }
// or auto-detected from hex string:
accentColor: '#3b82f6'
```

### 9. Text Input
```tsx
title: { type: 'text', default: 'Hello', placeholder: 'Enter title...' }
// or auto-detected from plain string:
label: 'Click me'
```

### 10. Folder (nested grouping)
```tsx
shadow: {
  offsetY: [8, 0, 24],
  blur: [16, 0, 48],
  opacity: [0.2, 0, 1],
}
```

## Output Format

Always generate complete, copy-paste ready code:

```tsx
import { useDialKit } from 'dialkit'
import { motion } from 'motion/react'

function ComponentName() {
  const params = useDialKit('ComponentName', {
    // Generated config here
  })

  return (
    <motion.div
      style={{
        // Apply params
      }}
      animate={{
        // Animate params
      }}
      transition={params.spring}
    />
  )
}
```

## Example Generations

### Request: "sliders for blur and opacity"
```tsx
const params = useDialKit('Effects', {
  blur: [0, 0, 100],
  opacity: [1, 0, 1],
})

// Usage:
style={{
  filter: `blur(${params.blur}px)`,
  opacity: params.opacity,
}}
```

### Request: "spring animation with scale"
```tsx
const params = useDialKit('Animation', {
  scale: [1, 0.5, 2],
  spring: {
    type: 'spring',
    visualDuration: 0.3,
    bounce: 0.2,
  },
})

// Usage:
animate={{ scale: params.scale }}
transition={params.spring}
```

### Request: "card with shadow controls"
```tsx
const params = useDialKit('Card', {
  borderRadius: [16, 0, 50],
  shadow: {
    offsetY: [8, 0, 24],
    blur: [16, 0, 48],
    opacity: [0.2, 0, 1],
  },
})

// Usage:
style={{
  borderRadius: params.borderRadius,
  boxShadow: `0 ${params.shadow.offsetY}px ${params.shadow.blur}px rgba(0,0,0,${params.shadow.opacity})`,
}}
```

### Request: "controls with actions"
```tsx
const params = useDialKit('Slideshow', {
  autoPlay: true,
  interval: [3, 1, 10],
  next: { type: 'action' },
  prev: { type: 'action' },
  reset: { type: 'action' },
}, {
  onAction: (action) => {
    if (action === 'next') goNext()
    if (action === 'prev') goPrev()
    if (action === 'reset') reset()
  },
})
```

## Tips for Generation

1. **Infer panel name** from component name or context
2. **Group related controls** in nested objects (folders)
3. **Use Time mode springs** by default (simpler for most users)
4. **Include usage comments** showing how to apply each param
5. **Match user's coding style** if they shared code

---

## Design Critique

A systematic interface critique skill based on Josh Puckett's methodology from Interface Craft. Analyzes UI screenshots or component code and delivers specific, actionable feedback organized by visual design, interface design, interaction consistency, and user context.

---

## When to Use

Trigger on: "critique", "review", "feedback", "audit", "what's wrong", "improve", "polish", "refine", "redesign", "analyze this UI", "look at this", or when the user pastes a screenshot/image for evaluation.

---

## Input Modes

### 1. Image / Screenshot (Primary)
The user pastes or attaches a screenshot. Read the image with the Read tool, then critique what you see.

### 2. File Path (Secondary)
The user provides a component file path. Read the file, mentally render the layout from the JSX/TSX, and critique the structural and stylistic decisions in the code. Note: you cannot see the rendered output, so focus on what's inferrable — layout structure, spacing patterns, color choices, typography, hierarchy, component organization, and interaction patterns.

### 3. Live URL (Tertiary)
The user provides a URL. Use WebFetch to retrieve the page content, then critique based on the markup and any screenshots the user provides.

---

## Critique Methodology

Follow this sequence. Do NOT skip steps or merge them. Each section should feel like its own focused lens.

### Step 0: Context

Before critiquing, briefly establish:
- **What is this?** (app type, screen purpose, target user)
- **What emotional context surrounds this task?** (stressful? casual? high-stakes? routine?)

This matters. A divorce filing app demands different care than a podcast player. Name the context so the critique respects it.

### Step 1: First Impressions

Spend one paragraph on gut reaction. What stands out? What feels off? What's the overall impression? Be honest and direct — not tentative.

This is the "noticing" step. The skill of seeing what's actually in front of you, not what you expect to see.

### Step 2: Visual Design

Audit these specific dimensions:

| Dimension | What to Look For |
| --- | --- |
| **Color intentionality** | Is every color used with purpose? Or are colors applied as decoration without meaning? Look for: too many background colors, competing accents, colors that don't establish hierarchy. |
| **Typographic hierarchy** | Is there a clear scale from most important to least? Count the distinct sizes/weights. Are headlines distinguished from body from labels? Is there unnecessary repetition of type styles? |
| **Shadow & stroke quality** | Are shadows crisp or muddy? Are strokes too prominent, competing with content? Do outlines/borders add structure or noise? |
| **Visual weight vs. importance** | Do the visually heaviest elements match what's semantically most important? Or do decorative elements steal attention from primary actions? |
| **Spacing & alignment** | Is spacing consistent? Are elements aligned to a clear grid? Is there excess padding pushing content away from where it should be? |
| **Icon consistency** | Are icons from the same family? Same weight/stroke width? Same optical size? Or is it a mix of styles? |

For each issue found, use this structure:
> **[Issue name]** — [Specific factual observation]. [Impact on user or experience]. [What it could be instead.]

Be precise. Count things. Quote text. Name colors. Measure relative sizes. "There are four distinct background colors competing for attention" is better than "too many colors."

### Step 3: Interface Design

Audit these dimensions:

| Dimension | What to Look For |
| --- | --- |
| **Focusing mechanism** | Is it clear where the user should look first? Is there a visual entry point? Or does everything compete for attention equally? |
| **Progressive disclosure** | Is complexity revealed gradually, or is everything dumped on the user at once? Are there 40 things on screen when 5 would suffice? |
| **Information density** | Is the density appropriate for the context? Data dashboards can be dense; onboarding should not be. |
| **Expectation setting** | Does the user know what will happen next? Is progress communicated? Is scope clear? |
| **Feedback & reward** | Does the interface acknowledge user actions? Are completed items celebrated or just checked off? Is there a sense of forward momentum? |
| **Redundancy** | Are labels, titles, or descriptions repeating information the user already knows? Can anything be removed without losing meaning? |

Frame issues as missed opportunities:
> "We're missing an opportunity to [reward progress / reduce cognitive load / set expectations / etc.]"

### Step 4: Consistency & Conventions

| Dimension | What to Look For |
| --- | --- |
| **Pattern consistency** | Are similar actions handled the same way throughout? Or do interaction patterns shift without reason? |
| **Platform conventions** | Does the design follow established platform patterns (iOS, Android, web)? Deviations should be intentional improvements, not accidents. |
| **Component reuse** | Are there elements that look like they should be the same component but aren't? Inconsistent card styles, button treatments, list items? |
| **Visual language cohesion** | Does the interface feel like one designer made it? Or does it feel assembled from different kits? |

### Step 5: User Context

This is where empathy meets analysis:

- **How does this design make the user feel?** Name the emotion. "Overwhelmed," "confused," "unsupported," "rushed."
- **What is the user's likely state of mind?** Anxious? Focused? Browsing casually? Under time pressure?
- **Does the interface respect that state?** Or does it add unnecessary cognitive burden?
- **What would "uncommon care" look like here?** What would surprise the user with thoughtfulness?

---

## Output Format

Structure the critique as:

```
## Context
[1-2 sentences on what this is and who it's for]

## First Impressions
[1 paragraph, direct and honest]

## Visual Design
[Each issue as: **Issue Name** — observation. Impact. Opportunity.]

## Interface Design
[Each issue framed as missed opportunities]

## Consistency & Conventions
[Pattern and convention issues]

## User Context
[Empathy-driven observations]

## Top Opportunities
[Ranked list of the 3-5 highest-impact changes, each in one sentence]
```

---

## Voice Rules

Follow these strictly. They define the critique style.

### BE:
- **Specific** — "There are six columns of data per row" not "there's a lot of data"
- **Decisive** — "This is overwhelming" not "this might feel overwhelming"
- **Factual first** — State what you see before judging it
- **Impact-aware** — Always connect the observation to how it affects the user
- **Constructive** — Every problem gets paired with an opportunity or direction
- **Quantitative** — Count elements, name colors, measure relative sizes

### DO NOT:
- **Hedge** — No "maybe," "perhaps," "it could be argued that"
- **Apologize** — No "unfortunately" or "sadly"
- **Be vague** — No "the design feels off" without saying exactly what and why
- **Prescribe without reasoning** — Never say "change X to Y" without explaining the why
- **Add praise padding** — Don't sandwich criticism with empty compliments. If something works well, say so specifically. But don't manufacture positivity.
- **Use jargon without explanation** — "Progressive disclosure" is fine. "The affordance signifiers lack semiotic clarity" is not.

### Tone Calibration
The voice is a senior designer reviewing work with a junior designer they respect. Direct, analytical, and honest — but rooted in wanting the work to be great. No cruelty, no condescension, but also no hand-holding. The goal is to make the designer *see* what you see.

---

## Severity Guide

Not all issues are equal. When listing issues, implicitly order by impact:

1. **Structural** — Problems with information architecture, missing functionality, wrong mental model. These change what the interface *is*.
2. **Behavioral** — Problems with how the interface responds, flows, or communicates. These change how the interface *feels*.
3. **Visual** — Problems with color, type, spacing, shadows. These change how the interface *looks*.

A structural issue (wrong mental model for a divorce app) matters more than a visual one (shadow is slightly muddy). Prioritize accordingly.

---

## Frameworks to Reference

These are the conceptual tools behind the critique. You don't need to name them explicitly, but they should inform your analysis:

### Noticing
The foundation. Most people glance; good designers see. Count the elements. Name the colors. Measure the spacing. The specificity of your observation is the quality of your critique.

### Industry Standards
Every popular app in a category sets an invisible bar. Users carry those expectations into every new app. A notes app is compared to Apple Notes, Bear, Notion. A dashboard is compared to Stripe, Linear, Vercel. If the design falls below the bar users already carry, it feels amateur — even if the user can't articulate why.

Ask: "What would [best-in-class app in this category] do here?"

### Facets of Quality
Quality isn't one thing. It's a collection of attributes. For any given interface, identify which 3-5 attributes matter most. Not every app needs to be "playful" — but every app needs to be clear about what it values and execute on those values consistently.

### Uncommon Care
The difference between good and great is often invisible to people who haven't seen great. Look for moments where the designer could have gone further — micro-interactions, empty states, error messages, transitions, loading states, edge cases. These are where "uncommon care" lives.

### Separation of Concerns
Visual design, interface design, and interaction design are different skills solving different problems. A beautiful interface can be unusable. A usable interface can be ugly. Critique each dimension on its own terms before synthesizing.

---

## Examples of Good Critique Language

**Visual:**
> **Muddy shadows** — The card shadows use a large blur radius with low opacity, creating a hazy, unfocused look rather than crisp depth. This makes the cards feel like they're floating in fog rather than sitting on a surface. Tighter, more directional shadows would give the layout a cleaner sense of elevation.

**Interface:**
> **No focusing mechanism** — All four content areas compete equally for attention. There's no visual entry point — no element says "start here." The user's eye bounces between the sidebar, the header stats, the chart, and the table with no clear priority. A stronger size or weight differential on the primary content area would give the layout a clear narrative.

**User context:**
> **Demoralizing progress display** — Showing "10 / 47 tasks complete" immediately communicates that 37 tasks remain. For a process that takes weeks and involves one of the most stressful experiences in a person's life, this is demoralizing. "Complete Phase 1 of 4" is psychologically very different — it frames the same progress as achievable milestones rather than an endless checklist.

**Opportunity:**
> We're missing a huge opportunity to reward progress. Completed steps could collapse or fade, making the remaining work feel smaller — not larger — as the user advances.


---

## Appendix: DialKit `config-patterns.json`

```json
{
  "controlTypes": {
    "slider": {
      "description": "Numeric slider control",
      "formats": [
        {
          "syntax": "[default, min, max]",
          "example": "blur: [24, 0, 100]",
          "description": "Explicit range tuple"
        },
        {
          "syntax": "number",
          "example": "scale: 1.18",
          "description": "Auto-inferred range based on value"
        }
      ],
      "usage": "Returns number value directly: params.blur"
    },
    "toggle": {
      "description": "Boolean on/off switch",
      "formats": [
        {
          "syntax": "boolean",
          "example": "visible: true",
          "description": "Boolean value creates toggle"
        }
      ],
      "usage": "Returns boolean: params.visible"
    },
    "spring": {
      "description": "Visual spring curve editor with live preview",
      "formats": [
        {
          "syntax": "{ type: 'spring', visualDuration, bounce }",
          "example": "spring: { type: 'spring', visualDuration: 0.3, bounce: 0.2 }",
          "description": "Time mode - simpler, recommended for most cases"
        },
        {
          "syntax": "{ type: 'spring', stiffness, damping, mass }",
          "example": "spring: { type: 'spring', stiffness: 200, damping: 25, mass: 1 }",
          "description": "Physics mode - more control over spring behavior"
        }
      ],
      "usage": "Returns SpringConfig object: transition={params.spring}",
      "defaults": {
        "time": { "visualDuration": 0.3, "bounce": 0.2 },
        "physics": { "stiffness": 200, "damping": 25, "mass": 1 }
      }
    },
    "action": {
      "description": "Button that triggers callback",
      "formats": [
        {
          "syntax": "{ type: 'action' }",
          "example": "reset: { type: 'action' }",
          "description": "Basic action button using key as label"
        },
        {
          "syntax": "{ type: 'action', label: string }",
          "example": "next: { type: 'action', label: 'Next Slide' }",
          "description": "Action with custom label"
        }
      ],
      "usage": "Requires onAction callback in options: onAction: (action) => { if (action === 'reset') handleReset() }"
    },
    "select": {
      "description": "Dropdown select control",
      "formats": [
        {
          "syntax": "{ type: 'select', options: string[], default?: string }",
          "example": "theme: { type: 'select', options: ['light', 'dark'], default: 'dark' }",
          "description": "Simple string options"
        },
        {
          "syntax": "{ type: 'select', options: { value, label }[] }",
          "example": "size: { type: 'select', options: [{ value: 'sm', label: 'Small' }, { value: 'lg', label: 'Large' }] }",
          "description": "Options with separate value and display label"
        }
      ],
      "usage": "Returns selected value as string: params.theme"
    },
    "color": {
      "description": "Color picker control",
      "formats": [
        {
          "syntax": "{ type: 'color', default?: string }",
          "example": "bgColor: { type: 'color', default: '#3b82f6' }",
          "description": "Explicit color config"
        },
        {
          "syntax": "string (hex format)",
          "example": "accentColor: '#3b82f6'",
          "description": "Auto-detected from hex string (#RGB, #RRGGBB, or #RRGGBBAA)"
        }
      ],
      "usage": "Returns hex color string: params.bgColor"
    },
    "text": {
      "description": "Text input control",
      "formats": [
        {
          "syntax": "{ type: 'text', default?: string, placeholder?: string }",
          "example": "title: { type: 'text', default: 'Hello', placeholder: 'Enter title...' }",
          "description": "Explicit text config"
        },
        {
          "syntax": "string (non-hex)",
          "example": "label: 'Click me'",
          "description": "Auto-detected from plain string"
        }
      ],
      "usage": "Returns string value: params.title"
    },
    "folder": {
      "description": "Collapsible group for organizing controls",
      "formats": [
        {
          "syntax": "{ nested: DialConfig }",
          "example": "shadow: { offsetY: [8, 0, 24], blur: [16, 0, 48] }",
          "description": "Nested object creates folder"
        }
      ],
      "usage": "Access nested values: params.shadow.offsetY"
    }
  },
  "smartDefaults": {
    "blur": { "default": 0, "min": 0, "max": 100, "step": 1 },
    "opacity": { "default": 1, "min": 0, "max": 1, "step": 0.01 },
    "scale": { "default": 1, "min": 0.5, "max": 2, "step": 0.1 },
    "rotation": { "default": 0, "min": -180, "max": 180, "step": 1 },
    "rotate": { "default": 0, "min": -180, "max": 180, "step": 1 },
    "offsetX": { "default": 0, "min": -100, "max": 100, "step": 1 },
    "offsetY": { "default": 0, "min": -100, "max": 100, "step": 1 },
    "x": { "default": 0, "min": -100, "max": 100, "step": 1 },
    "y": { "default": 0, "min": -100, "max": 100, "step": 1 },
    "borderRadius": { "default": 0, "min": 0, "max": 50, "step": 1 },
    "shadowBlur": { "default": 16, "min": 0, "max": 48, "step": 1 },
    "shadowOffsetY": { "default": 8, "min": 0, "max": 24, "step": 1 },
    "shadowOpacity": { "default": 0.2, "min": 0, "max": 1, "step": 0.01 },
    "gap": { "default": 16, "min": 0, "max": 48, "step": 1 },
    "padding": { "default": 16, "min": 0, "max": 48, "step": 1 },
    "width": { "default": 200, "min": 50, "max": 500, "step": 1 },
    "height": { "default": 200, "min": 50, "max": 500, "step": 1 },
    "delay": { "default": 0, "min": 0, "max": 2, "step": 0.1 },
    "duration": { "default": 0.3, "min": 0, "max": 2, "step": 0.1 },
    "stagger": { "default": 0.1, "min": 0, "max": 0.5, "step": 0.01 }
  },
  "typeDefinitions": {
    "SpringConfig": "{ type: 'spring'; stiffness?: number; damping?: number; mass?: number; visualDuration?: number; bounce?: number }",
    "ActionConfig": "{ type: 'action'; label?: string }",
    "SelectConfig": "{ type: 'select'; options: (string | { value: string; label: string })[]; default?: string }",
    "ColorConfig": "{ type: 'color'; default?: string }",
    "TextConfig": "{ type: 'text'; default?: string; placeholder?: string }",
    "DialValue": "number | boolean | string | SpringConfig | ActionConfig | SelectConfig | ColorConfig | TextConfig",
    "DialConfig": "{ [key: string]: DialValue | [number, number, number] | DialConfig }"
  },
  "commonPatterns": {
    "fadeIn": {
      "description": "Fade in animation controls",
      "config": {
        "opacity": [0, 0, 1],
        "spring": { "type": "spring", "visualDuration": 0.4, "bounce": 0 }
      }
    },
    "scaleUp": {
      "description": "Scale up animation controls",
      "config": {
        "scale": [0.9, 0.5, 1.5],
        "spring": { "type": "spring", "visualDuration": 0.3, "bounce": 0.2 }
      }
    },
    "slideIn": {
      "description": "Slide in animation controls",
      "config": {
        "offsetY": [20, -100, 100],
        "opacity": [0, 0, 1],
        "spring": { "type": "spring", "visualDuration": 0.4, "bounce": 0.1 }
      }
    },
    "cardShadow": {
      "description": "Card shadow controls",
      "config": {
        "shadow": {
          "offsetY": [8, 0, 24],
          "blur": [16, 0, 48],
          "opacity": [0.2, 0, 1]
        }
      }
    },
    "glassEffect": {
      "description": "Glassmorphism effect controls",
      "config": {
        "blur": [16, 0, 48],
        "opacity": [0.8, 0, 1],
        "borderRadius": [16, 0, 50]
      }
    },
    "hoverCard": {
      "description": "Interactive hover card controls",
      "config": {
        "scale": [1, 0.95, 1.1],
        "shadowBlur": [8, 0, 32],
        "shadowOffsetY": [4, 0, 16],
        "spring": { "type": "spring", "visualDuration": 0.2, "bounce": 0.1 }
      }
    }
  }
}
```
