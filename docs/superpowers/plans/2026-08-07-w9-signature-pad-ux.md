# Issue #22 — W-9 Signature Pad UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/uw/:token` W-9 draw-signature pad large enough and forgiving so leaving the pad slightly does not break the stroke.

**Architecture:** Keep the existing canvas-based draw/type flow in `UnderwritingW9Sign.jsx`. Fix coordinate mapping + pointer capture, enlarge the pad, and extract a small pure helper for hit-testing / canvas sizing so behavior is unit-testable without a browser canvas.

**Tech Stack:** React, HTML canvas, pointer events (`setPointerCapture`), existing `completeUnderwritingRequest` submit path (unchanged).

## Global Constraints

- Do **not** change BoldSign / merchant agreement signing (`OnboardingVerification`) — this bug is the **W-9 underwriting** page at `/uw/:token`.
- Do **not** change PDF stamp / `completeUnderwritingRequest` payload shape unless a test proves the PNG dimensions break Elavon/W-9 stamp (default: keep PNG from canvas `toDataURL`).
- Frontend-only fix; no Base44 function redeploy required for #22.
- Preserve Draw + Type name modes; Clear still works.
- Prefer `cb-*` tokens / existing card layout; light form surface stays white for the pad.

## File map

| File | Role |
|---|---|
| `src/pages/UnderwritingW9Sign.jsx` | Signature UI + draw handlers (main change) |
| `src/lib/w9SignaturePad.js` | Pure helpers: pad size constants, CSS→canvas coordinate map, optional “should continue stroke” |
| `src/lib/w9SignaturePad.test.js` | Unit tests for helpers |
| `docs/superpowers/plans/2026-08-07-w9-signature-pad-ux.md` | This plan |

## Root cause (confirmed in code)

In `UnderwritingW9Sign.jsx` (~540–552):

1. **Small pad:** canvas intrinsic size is `width={560} height={120}` with `className="w-full"` — CSS height stays ~120px and looks tiny on desktop.
2. **Fragile tracking:** `onMouseLeave={endDraw}` ends the stroke as soon as the cursor leaves the canvas by a pixel — matches “leaving the signature area even slightly causes the mouse tracking to fail.”
3. **No pointer capture:** mouse/touch handlers do not call `setPointerCapture`, so moves outside the element are lost even if we stop using `mouseleave`.

---

### Task 1: Helper + failing tests

**Files:**
- Create: `src/lib/w9SignaturePad.js`
- Create: `src/lib/w9SignaturePad.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  W9_PAD_CSS_HEIGHT,
  mapPointerToCanvas,
} from './w9SignaturePad.js';

describe('w9SignaturePad', () => {
  it('exposes a taller default CSS height than the legacy 120px pad', () => {
    assert.ok(W9_PAD_CSS_HEIGHT >= 200);
  });

  it('maps client coords through bounding rect into canvas bitmap space', () => {
    const pt = mapPointerToCanvas(
      { clientX: 100, clientY: 50 },
      { left: 0, top: 0, width: 280, height: 100 },
      { width: 560, height: 200 },
    );
    assert.equal(pt.x, 200);
    assert.equal(pt.y, 100);
  });
});
```

- [ ] **Step 2: Run test — expect fail**

```bash
node --test src/lib/w9SignaturePad.test.js
```

- [ ] **Step 3: Implement minimal helper**

```js
/** Minimum on-screen pad height (CSS px). Legacy was 120. */
export const W9_PAD_CSS_HEIGHT = 220;

/** Bitmap width used when exporting signature PNG. */
export const W9_PAD_BITMAP_WIDTH = 560;

export function mapPointerToCanvas(evt, rect, canvas) {
  const clientX = evt.touches?.[0]?.clientX ?? evt.clientX;
  const clientY = evt.touches?.[0]?.clientY ?? evt.clientY;
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
node --test src/lib/w9SignaturePad.test.js
```

- [ ] **Step 5: Commit** (only if Teddy asked for a commit)

---

### Task 2: Enlarge pad + pointer capture (no mouseleave end)

**Files:**
- Modify: `src/pages/UnderwritingW9Sign.jsx`

- [ ] **Step 1: Import helpers**; replace hardcoded `getCanvasPoint` with `mapPointerToCanvas` using `canvas.getBoundingClientRect()`.

- [ ] **Step 2: Size the canvas for retina + taller pad**

On entering `sign` phase (and on window resize while signing), set:

- CSS height ≈ `W9_PAD_CSS_HEIGHT` (e.g. `style={{ height: W9_PAD_CSS_HEIGHT }}` or Tailwind `h-[220px]`)
- Bitmap: `canvas.width = Math.round(cssWidth * dpr)`, `canvas.height = Math.round(W9_PAD_CSS_HEIGHT * dpr)`
- Scale context by `dpr` so stroke width stays ~2 CSS px
- Re-clear white background after resize

- [ ] **Step 3: Use Pointer Events with capture**

Replace mouse/touch trio with:

- `onPointerDown` → `drawingRef = true`, `target.setPointerCapture(pointerId)`, `beginPath`/`moveTo`
- `onPointerMove` → if drawing, `lineTo`/`stroke`
- `onPointerUp` / `onPointerCancel` → `drawingRef = false`, `releasePointerCapture` if needed

**Remove** `onMouseLeave={endDraw}` (this is the tracking bug).

Keep `touch-none` / `preventDefault` on pointerdown so mobile does not scroll while signing.

- [ ] **Step 4: Manual verify**

1. Open a live or staged `/uw/<token>` link (Deal Room → request W-9 → copy link), or use a test token.
2. Continue to sign → Draw mode.
3. Confirm pad is ~220px tall and full card width.
4. Start a stroke, drag **outside** the pad, release — stroke should continue while pointer is down (capture), and must not “die” from a 1px leave.
5. Clear + Type name still work; Submit still produces PDF.

- [ ] **Step 5: Commit** (only if Teddy asked)

---

### Task 3: Polish + docs

**Files:**
- Modify: `AI_CHANNEL.md` (append-only)
- Optionally close #22 after live verify

- [ ] **Step 1:** Append AI_CHANNEL note: root cause (120px + mouseleave), pointer-capture fix, frontend-only redeploy.
- [ ] **Step 2:** After publish, comment + close GitHub #22.
- [ ] **Step 3:** Stop — do not start #23 (Deal Room → Underwriting Room) in the same PR unless Teddy asks.

## Out of scope

- Issue #23 Deal Room rename / UW nav tab
- BoldSign iframe sizing
- Changing W-9 PDF field layout beyond accepting a taller signature PNG

## Redeploy for #22

**Frontend only** (Base44 publish / GitHub sync of the app). No function republish required.