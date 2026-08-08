/**
 * Run: node --test src/lib/w9SignaturePad.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  W9_PAD_CSS_HEIGHT,
  mapPointerToCanvas,
  bitmapSizeForPad,
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

  it('maps touch events the same way', () => {
    const pt = mapPointerToCanvas(
      { touches: [{ clientX: 70, clientY: 25 }] },
      { left: 10, top: 5, width: 60, height: 20 },
      { width: 120, height: 40 },
    );
    assert.equal(pt.x, 120);
    assert.equal(pt.y, 40);
  });

  it('scales bitmap by devicePixelRatio', () => {
    const s = bitmapSizeForPad(280, 220, 2);
    assert.equal(s.width, 560);
    assert.equal(s.height, 440);
    assert.equal(s.dpr, 2);
  });
});