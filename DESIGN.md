---
name: Cliqbux E-Onboarding
description: Dark fintech merchant portal — charcoal structure, one gold signal for action.
colors:
  accent: "#FEAC27"
  accent-muted: "#FEAC2724"
  bg: "#0E1319"
  surface: "#161C26"
  surface-raised: "#1A212C"
  border: "#FFFFFF12"
  border-strong: "#FFFFFF29"
  success: "#4ADE80"
  danger: "#F87171"
  ink-on-accent: "#0E1319"
typography:
  display:
    fontFamily: "Poppins, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Poppins, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.015em"
  body-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "-0.006em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
    letterSpacing: "0"
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.04em"
rounded:
  cb: "12px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-on-accent}"
    rounded: "{rounded.cb}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-on-accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#FFFFFF"
    rounded: "{rounded.cb}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.cb}"
  card-raised:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.cb}"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "#FFFFFF"
    rounded: "{rounded.cb}"
    padding: "10px 12px"
---

# Design System: Cliqbux E-Onboarding

## 1. Overview

**Creative North Star: "The Gold Wire"**

One bright signal runs through charcoal structure. The portal is a dark, quiet tool for finishing KYC, banking, and e-sign — modern and confident, never theatrical. Gold appears where the merchant must act (primary CTAs, active progress, selected state). Everything else stays tonal: ink background, slate panels, hairline borders, type weight for hierarchy.

This system rejects Generic purple / gradient “AI SaaS” dashboards, Busy traditional bank portals with cluttered forms and dense chrome, and Playful consumer apps heavy on illustration, bounce, and novelty. Depth comes from surface steps and two shadows, not glow stacks. Status is a dot and a caption, not a rainbow of pills.

**Key Characteristics:**
- Restrained dark fintech: one accent ≤ ~10% of any screen
- Hierarchy via indentation, 1px rails, and type — not colored chrome
- Solid gold primary CTAs; ghost secondary
- Exactly five type sizes; Poppins for titles, Inter for UI
- Motion only for state (spring 150/20); quote documents stay white

## 2. Colors

Dark charcoal neutrals with a single brand gold measured from cliqbux.com hero CTA. Semantic green/red for complete and error only.

### Primary
- **Cliqbux Gold** (#FEAC27 / `--cb-accent`): Primary CTAs, active step indicators, focus rings, selected accents. Scarcity is the point.
- **Gold Tint** (#FEAC2724 / `--cb-accent-muted`): Soft selected-row / muted gold fill — never a full-bleed wash.

### Neutral
- **Ink Charcoal** (#0E1319 / `--cb-bg`): Page background and field wells.
- **Slate Panel** (#161C26 / `--cb-surface`): Cards and main panels.
- **Raised Slate** (#1A212C / `--cb-surface-raised`): Nested panels, modals, popovers, location rows.
- **Hairline** (#FFFFFF12 / `--cb-border`): Resting borders and dividers.
- **Hairline Strong** (#FFFFFF29 / `--cb-border-strong`): Hover / focus borders.
- **Ink on Gold** (#0E1319): Text on solid gold buttons for contrast.

### Semantic
- **Success** (#4ADE80 / `--cb-success`): Complete, verified, saved — usually as a dot or check, not a green pill.
- **Danger** (#F87171 / `--cb-danger`): Errors and destructive actions.

### Named Rules
**The One Wire Rule.** Cliqbux Gold is for action and selection only. Do not decorate inactive chrome with gold.

**The Token File Rule.** Approved hex values live only in `src/styles/tokens.css`. Never invent parallel hex in JSX; change the token file if the brand must shift.

## 3. Typography

**Display Font:** Poppins (with Inter fallback) — `font-display`  
**Body Font:** Inter (with system-ui fallback)

**Character:** Geometric Poppins for page and section titles; Inter for dense product UI. Fixed rem/px scale — no fluid clamp headings in the portal.

### Hierarchy
- **Display** (600, 28px / 34px, −0.025em): Page headline (`text-cb-display`).
- **Title** (600, 20px / 28px, −0.015em): Section / entity headings (`text-cb-title` + `font-display`).
- **Body LG** (400, 16px / 24px, −0.006em): Lead paragraphs (`text-cb-body-lg`).
- **Body** (400, 14px / 20px): Default UI (`text-cb-body`).
- **Caption** (600, 12px / 16px, +0.04em): Uppercase labels and field captions (`text-cb-caption`).

### Named Rules
**The Five Size Rule.** No other font sizes in the portal. If it doesn’t fit the five, rewrite the layout — don’t invent a sixth size.

**The Display Ceiling Rule.** Display letter-spacing stays ≥ −0.04em (current display is −0.025em). Do not tighten further.

## 4. Elevation

Tonal layering first (bg → surface → surface-raised). Shadows are exactly two levels — ambient card rest and modal overlay. No multi-layer decorative stacks, no glow rings.

### Shadow Vocabulary
- **Raised** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.40)` / `shadow-cb-raised`): Cards resting on the page — subtle only.
- **Overlay** (`box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.55)` / `shadow-cb-overlay`): Modals, dropdowns, popovers only.

### Named Rules
**The Two Shadow Rule.** If you need a third shadow, you’re decorating — use a surface step or a hairline instead.

## 5. Components

Quiet, familiar product controls. Solid gold primary; ghost secondary; status as dot + caption.

### Buttons
- **Shape:** Gently rounded (`12px` / `rounded-cb`)
- **Primary:** Solid Cliqbux Gold background, Ink on Gold text, semibold body. Hover via opacity (~90%). Disabled: muted surface, gray text.
- **Ghost / Secondary:** Transparent or quiet bordered; no gold fill.
- **Focus:** `ring-2` with accent (see inputs).

### Status
- **Style:** 6px colored dot + plain caption — never tinted badge pills or multi-color tier chips.
- Success / accent / danger dots map to semantic tokens; label stays neutral text.

### Cards / Containers
- **Corner Style:** `12px` (`rounded-cb`)
- **Background:** Slate Panel or Raised Slate; hairline border
- **Shadow Strategy:** Raised at rest optional; Overlay only when elevated (modals / drag)
- **Org hierarchy:** Indentation + 1px connecting rails + type weight — not colored MID pills
- **Document exception:** HubSpot quote / signing document frames stay **white** for readability

### Inputs / Fields
- **Style:** Ink Charcoal well, hairline border, `12px` radius, white text, gray placeholder
- **Hover:** Border → Hairline Strong
- **Focus:** Accent ring (`focus:ring-2 focus:ring-cb-accent`), border transparent
- **Error:** Danger border / text; no side-stripe thicker than 1px as decoration (left-rule banners for lock/error states are structural callouts, not card chrome)

### Navigation / Progress
- ProgressTracker: muted gold fill + hairline for active; solid gold for complete; `layoutId` capsule spring
- Milestone cards: quiet raised surface; locked = dimmed; CTAs solid gold

### Signature moments (motion, folded here)
- Bank-just-connected check; post-submit confetti once per session
- Default spring `{ stiffness: 150, damping: 20 }`; transform/opacity only; respect `prefers-reduced-motion`
- Loading uses `.skeleton` shimmer placeholders — not decorative border shimmer on idle cards

## 6. Do's and Don'ts

### Do:
- **Do** use `cb-*` Tailwind utilities and change values only in `src/styles/tokens.css`.
- **Do** keep primary actions solid Cliqbux Gold (#FEAC27) and scarce.
- **Do** show status as a small colored dot + plain caption.
- **Do** use hierarchy via indentation, 1px rails, and type weight.
- **Do** keep quote/document iframes white.
- **Do** keep explicit Save buttons (no debounce autosave for entity/MID fields).
- **Do** respect reduced motion; motion communicates state only.

### Don't:
- **Don't** ship Generic purple / gradient “AI SaaS” dashboards.
- **Don't** imitate Busy traditional bank portals with cluttered forms and dense chrome.
- **Don't** build Playful consumer apps heavy on illustration, bounce, and novelty.
- **Don't** use purple/indigo gradients, glow rings, or multi-layer decorative shadows.
- **Don't** use blue MID pills, green “Complete” pills, or color-coded pricing-tier badges.
- **Don't** hardcode hex in JSX or invent a parallel palette (including soft dashboard gold `#F0AD4E` as a second accent).
- **Don't** add font sizes outside the five-token scale.
- **Don't** change form fields, validation, fetch paths, or save semantics in a “visual” pass.
