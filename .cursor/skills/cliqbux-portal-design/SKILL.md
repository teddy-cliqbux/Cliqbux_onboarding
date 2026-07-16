---
name: cliqbux-portal-design
description: >-
  Cliqbux onboarding portal design system — cb-* tokens, restraint UI, motion
  rules, and style-only change boundaries. Use when editing portal UI, Tailwind
  classes, framer-motion, tokens.css, OnboardingLocations/Banking/Verification,
  ProgressTracker, PostSubmissionDashboard, ApplicationManager, or when
  reviewing look-and-feel. Wins over generic UI skills (e.g. userinterface-wiki)
  on brand, color, and decoration choices.
---

# Cliqbux Portal Design

Source of truth: `src/styles/tokens.css` + Tailwind `cb-*` utilities in `tailwind.config.js`.
Approved by Teddy 2026-07-12 / 2026-07-13. **Do not invent a parallel palette.**

## When this skill applies

Any visual or interaction change on merchant or admin onboarding surfaces.
If `userinterface-wiki` (or similar) conflicts with this file on color, decoration,
or motion density — **follow this skill**.

## Hard boundaries (style-only)

Visual redesign must **not** change:

- Data fields, form keys, entity schema
- Validation rules or save-button semantics
- Fetch paths / function names / auth gates

Explicit **Save** buttons stay. Never replace with debounce/autosave (Critical Lesson #2).

## Tokens — use these, never hardcode hex

| Role | Token / class |
|------|----------------|
| Page bg | `bg-cb-bg` |
| Card / panel | `bg-cb-surface` |
| Nested / modal | `bg-cb-surface-raised` |
| Hairline | `border-cb-border` / `border-cb-border-strong` |
| Brand gold CTA | `bg-cb-accent` / `text-cb-accent` |
| Gold tint (selected) | `bg-cb-accent-muted` |
| Success / danger | `text-cb-success` / `text-cb-danger` |
| Radius | `rounded-cb` (12px) |
| Shadows | `shadow-cb-raised` (cards) · `shadow-cb-overlay` (**modals only**) |

**Canonical accent:** `#FEAC27` via `--cb-accent`. Do not introduce `#F0AD4E`, purple, indigo, or multi-color tier badges.

### Type scale (only these five)

| Class | Use |
|-------|-----|
| `text-cb-caption` | Uppercase labels, field captions |
| `text-cb-body` | Default UI |
| `text-cb-body-lg` | Lead copy |
| `text-cb-title` + `font-display` | Section headings (Poppins) |
| `text-cb-display` + `font-display` | Page headline (Poppins) |

Body stays Inter. No extra font sizes.

## Restraint language (principal-designer pass)

- Quiet surfaces + hairline borders — not heavy card chrome
- Hierarchy via **indentation + 1px connecting rails + type weight** — not colored pills
- Status = **small colored dot + plain caption** (not tinted badge pills)
- CTAs = **solid gold** — no gradient, glow, or shimmer borders
- Secondary = ghost / quiet bordered
- Pricing tier badge = one quiet bordered caption (no per-tier colors)
- Quote / document iframe card stays **white** (readability) — do not dark-theme it

### Banned patterns

- Purple / indigo gradients, glow rings, multi-layer decorative shadows
- Blue MID pills, green “Complete” pills, color-coded status chips
- Mouse-tracking, canvas effects, shimmer borders as decoration
- Hardcoded hex in JSX (change `tokens.css` instead)

## Motion — state only, never decoration

Default spring: `{ stiffness: 150, damping: 20 }`. Transform / opacity only.

Allowed:

- Step transitions (`AnimatePresence mode="wait"`, directional slide)
- Accordion height (Banking, Locations expand/collapse)
- `layout` / `layoutId` for sibling displace + progress capsule
- `.skeleton` for async loading
- Signature moments only: bank-just-connected check; post-submit confetti **once per session** (respect `prefers-reduced-motion`)

Not allowed: decorative loops, entrance spam on every card, mouse-follow effects.

## Page header pattern

```
caption (text-cb-caption) → display title (text-cb-display font-display) → lead (text-cb-body-lg)
```

Ghost Back where needed. Solid gold primary CTA at the bottom of a completed section.

## Migration checklist (legacy surfaces)

When restyling Login, Register, auth, or leftover `amber-*` / shadcn chrome:

1. Swap colors to `cb-*` utilities
2. Replace status pills with dot + caption
3. Solid gold CTAs; remove gradients/glow
4. Verify zero hardcoded hex / purple / blue accent leftovers
5. Confirm no field / validation / fetch changes

## Conflict resolution

| Topic | Winner |
|-------|--------|
| Brand gold, surfaces, type | This skill + `tokens.css` |
| Hit targets, a11y, timing craft | userinterface-wiki OK as checklist |
| “More animation / polish” | This skill — prefer less |
| Boarding / MSP / auth logic | `AGENTS.md` Critical Lessons — never overridden by design |
