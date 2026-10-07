import { describe, it, expect } from 'vitest';
import { splitLine } from './segments.js';
import { latexToExpression } from '../ml/postprocess.ts';

// n glyphs, each one stroke 40 wide and 100 tall, `gap` apart
function row(n, gap = 12, w = 40, h = 100) {
  const strokes = [];
  for (let i = 0; i < n; i++) {
    const x = 20 + i * (w + gap);
    strokes.push({ id: i, tool: 'pen', width: 3, points: [{ x, y: 0 }, { x: x + w, y: h }] });
  }
  return { strokes, minX: 20, maxX: 20 + (n - 1) * (w + gap) + w, minY: 0, maxY: h };
}

describe('splitLine', () => {
  it('leaves a short row in one piece', () => {
    expect(splitLine(row(5))).toHaveLength(1);
  });

  it('splits a long row into ordered pieces that cover the whole row', () => {
    const line = row(25);
    const parts = splitLine(line);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].x0).toBe(line.minX);
    expect(parts.at(-1).x1).toBe(line.maxX);
    for (let i = 1; i < parts.length; i++) expect(parts[i].x0).toBe(parts[i - 1].x1);
  });

  it('never cuts through a stroke and keeps pieces near the aspect limit', () => {
    const line = row(40);
    const parts = splitLine(line, { maxAspect: 6, pad: 16 });
    const h = line.maxY - line.minY + 32;
    for (const p of parts) expect(p.x1 - p.x0 + 32).toBeLessThanOrEqual(6 * h * 1.3);
    for (const p of parts.slice(0, -1)) {
      for (const s of line.strokes) {
        const a = s.points[0].x - 1.5;
        const b = s.points[1].x + 1.5;
        expect(p.x1 <= a || p.x1 >= b).toBe(true);
      }
    }
  });

  it('does not split when there is no gap to cut in', () => {
    const line = {
      strokes: [{ id: 1, tool: 'pen', width: 3, points: [{ x: 0, y: 0 }, { x: 2000, y: 50 }] }],
      minX: 0, maxX: 2000, minY: 0, maxY: 50,
    };
    expect(splitLine(line)).toHaveLength(1);
  });

  it('cuts in the widest gap near the target position', () => {
    const line = row(20);
    for (const s of line.strokes.slice(10)) for (const p of s.points) p.x += 60; // one wide gap
    line.maxX += 60;
    const wideGapMiddle = line.strokes[9].points[1].x + 1.5 + (12 + 60 - 3) / 2;
    const parts = splitLine(line);
    expect(parts.some((p) => Math.abs(p.x1 - wideGapMiddle) < 1)).toBe(true);
  });
});

describe('joining pieces', () => {
  it('converts the joined LaTeX as one expression, so brackets can span pieces', () => {
    const joined = ['(12+3', '4)\\times 5', '\\div 2='].join(' ');
    expect(latexToExpression(joined)).toEqual({ text: '(12+34)×5÷2=', clean: true });
  });
});
