import { describe, it, expect } from "vitest";
import {
  computeFit,
  strokesBBox,
  fillTensorData,
  parsePreprocessorConfig,
} from "./preprocess";
import { argmaxLastRow, hasRunawayRepeat } from "./decode";
import { latexToExpression } from "./postprocess";

describe("computeFit", () => {
  const bb = { minX: 0, minY: 0, maxX: 200, maxY: 50 };
  it("letterbox keeps aspect ratio and centers", () => {
    const f = computeFit(bb, 100, 100, 0.1, "letterbox");
    expect(f.sx).toBeCloseTo(0.4);
    expect(f.sy).toBeCloseTo(0.4);
    expect(f.ox).toBeCloseTo(10);
    expect(f.oy).toBeCloseTo(40);
  });
  it("stretch fills the padded box", () => {
    const f = computeFit(bb, 100, 100, 0.1, "stretch");
    expect(f.sx).toBeCloseTo(0.4);
    expect(f.sy).toBeCloseTo(1.6);
    expect(f.ox).toBeCloseTo(10);
    expect(f.oy).toBeCloseTo(10);
  });
  it("is finite for a flat line and for a single dot", () => {
    for (const b of [
      { minX: 5, minY: 5, maxX: 50, maxY: 5 },
      { minX: 5, minY: 5, maxX: 5, maxY: 5 },
    ]) {
      const f = computeFit(b, 100, 100, 0.1);
      expect([f.sx, f.sy, f.ox, f.oy].every(Number.isFinite)).toBe(true);
    }
  });
});

describe("strokesBBox", () => {
  it("returns null when there are no points", () => {
    expect(strokesBBox([])).toBeNull();
    expect(strokesBBox([[]])).toBeNull();
  });
  it("covers all strokes", () => {
    expect(strokesBBox([[{ x: 1, y: 2 }], [{ x: 5, y: -3 }]])).toEqual({
      minX: 1,
      minY: -3,
      maxX: 5,
      maxY: 2,
    });
  });
});

describe("parsePreprocessorConfig", () => {
  it("reads {height,width}, mean and std", () => {
    const s = parsePreprocessorConfig({
      size: { height: 384, width: 384 },
      image_mean: [0.5, 0.5, 0.5],
      image_std: [0.5, 0.5, 0.5],
    });
    expect([s.width, s.height]).toEqual([384, 384]);
    expect(s.mean).toEqual([0.5, 0.5, 0.5]);
  });
  it("accepts a bare number size and falls back to defaults", () => {
    expect(parsePreprocessorConfig({ size: 224 }).width).toBe(224);
    expect(parsePreprocessorConfig({}).width).toBe(384);
  });
});

describe("fillTensorData", () => {
  it("writes planar CHW and normalizes white to +1 and black to -1", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // px0 red, px1 green
    const out = new Float32Array(6);
    fillTensorData(rgba, out, 2, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], 1 / 255);
    expect(Array.from(out)).toEqual([1, -1, -1, 1, -1, -1]);
  });
});

describe("decode helpers", () => {
  it("argmaxLastRow looks only at the last position", () => {
    expect(argmaxLastRow(new Float32Array([9, 0, 0, 0, 0, 5]), 2, 3)).toBe(2);
  });
  it("hasRunawayRepeat detects a stuck token", () => {
    expect(hasRunawayRepeat([1, 2, 3, 3, 3], 3)).toBe(true);
    expect(hasRunawayRepeat([3, 3, 1, 3, 3], 3)).toBe(false);
  });
});

describe("latexToExpression", () => {
  it("maps \\times and \\div", () => {
    expect(latexToExpression("18+4\\times 3=").text).toBe("18+4×3=");
    expect(latexToExpression("7.5 \\div 2 =").text).toBe("7.5÷2=");
  });
  it("treats x as multiplication and normalizes minus signs", () => {
    expect(latexToExpression("9 x 9 =").text).toBe("9×9=");
    expect(latexToExpression("100−45=").text).toBe("100-45=");
  });
  it("converts simple numeric fractions", () => {
    expect(latexToExpression("\\frac{3}{4}").text).toBe("3÷4");
  });
  it("flags unsupported output as not clean", () => {
    expect(latexToExpression("\\text{hi}").clean).toBe(false);
    expect(latexToExpression("\\sqrt{4}").clean).toBe(false);
    expect(latexToExpression("1+2=").clean).toBe(true);
  });
});
