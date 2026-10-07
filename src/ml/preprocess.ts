import { CONFIG } from "./config";

export type Pt = { x: number; y: number; t?: number };
export type Stroke = Pt[];

export type RenderOpts = {
  fitMode: "letterbox" | "stretch";
  strokeFraction: number;
  padFraction: number;
  invert: boolean;
};
export const DEFAULT_OPTS: RenderOpts = {
  fitMode: CONFIG.FIT_MODE,
  strokeFraction: CONFIG.STROKE_FRACTION,
  padFraction: CONFIG.PAD_FRACTION,
  invert: CONFIG.INVERT,
};

export type PreprocessSpec = {
  width: number;
  height: number;
  mean: [number, number, number];
  std: [number, number, number];
  rescale: number;
};

/** Reads the model's own preprocessor_config.json. Never hardcode these. */
export function parsePreprocessorConfig(cfg: any): PreprocessSpec {
  let w = 384,
    h = 384;
  const s = cfg?.size;
  if (typeof s === "number") {
    w = h = s;
  } else if (s && typeof s === "object") {
    if (typeof s.width === "number" && typeof s.height === "number") {
      w = s.width;
      h = s.height;
    } else if (typeof s.shortest_edge === "number") {
      w = h = s.shortest_edge;
    } else if (typeof s.height === "number") {
      w = h = s.height;
    }
  }
  const three = (v: any, d: number): [number, number, number] =>
    Array.isArray(v) && v.length >= 3
      ? [v[0], v[1], v[2]]
      : typeof v === "number"
        ? [v, v, v]
        : [d, d, d];
  return {
    width: w,
    height: h,
    mean: three(cfg?.image_mean, 0.5),
    std: three(cfg?.image_std, 0.5),
    rescale:
      typeof cfg?.rescale_factor === "number" ? cfg.rescale_factor : 1 / 255,
  };
}

export function strokesBBox(strokes: Stroke[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of strokes)
    for (const p of s) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

/** Scale + offset mapping stroke coordinates into the model image. Safe for dots and flat lines. */
export function computeFit(
  bb: { minX: number; minY: number; maxX: number; maxY: number },
  W: number,
  H: number,
  pad: number,
  mode: "letterbox" | "stretch" = "letterbox",
) {
  const w = Math.max(bb.maxX - bb.minX, 1);
  const h = Math.max(bb.maxY - bb.minY, 1);
  const iw = W * (1 - 2 * pad);
  const ih = H * (1 - 2 * pad);
  let sx: number, sy: number;
  if (mode === "stretch") {
    sx = iw / w;
    sy = ih / h;
  } else {
    sx = sy = Math.min(iw / w, ih / h);
  }
  return {
    sx,
    sy,
    ox: (W - w * sx) / 2 - bb.minX * sx,
    oy: (H - h * sy) / 2 - bb.minY * sy,
  };
}

/** RGBA -> planar CHW floats with the model's own normalization. */
export function fillTensorData(
  rgba: Uint8ClampedArray,
  out: Float32Array,
  n: number,
  mean: [number, number, number],
  std: [number, number, number],
  rescale: number,
) {
  for (let c = 0; c < 3; c++) {
    const base = c * n;
    for (let i = 0; i < n; i++)
      out[base + i] = (rgba[i * 4 + c] * rescale - mean[c]) / std[c];
  }
}

// One canvas and one buffer, reused for every request (memory stability).
let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let buf: Float32Array | null = null;
let cw = 0,
  ch = 0;

function ensure(W: number, H: number) {
  if (!canvas || cw !== W || ch !== H) {
    canvas = new OffscreenCanvas(W, H);
    ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      throw new Error(
        "2D context unavailable in worker (OffscreenCanvas unsupported?)",
      );
    buf = new Float32Array(3 * W * H);
    cw = W;
    ch = H;
  }
  return { canvas: canvas!, ctx: ctx!, buf: buf! };
}

export function buildInput(
  strokes: Stroke[],
  spec: PreprocessSpec,
  o: RenderOpts,
) {
  const bb = strokesBBox(strokes);
  if (!bb) return null;
  const { width: W, height: H } = spec;
  const { canvas, ctx, buf } = ensure(W, H);
  const { sx, sy, ox, oy } = computeFit(bb, W, H, o.padFraction, o.fitMode);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = o.invert ? "black" : "white";
  ctx.fillRect(0, 0, W, H);
  const ink = o.invert ? "white" : "black";
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(2, Math.min(W, H) * o.strokeFraction);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of strokes) {
    if (s.length === 0) continue;
    if (s.length === 1) {
      // a dot, e.g. a decimal point
      ctx.beginPath();
      ctx.arc(
        s[0].x * sx + ox,
        s[0].y * sy + oy,
        ctx.lineWidth / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(s[0].x * sx + ox, s[0].y * sy + oy);
    for (let i = 1; i < s.length; i++)
      ctx.lineTo(s[i].x * sx + ox, s[i].y * sy + oy);
    ctx.stroke();
  }

  const img = ctx.getImageData(0, 0, W, H);
  fillTensorData(img.data, buf, W * H, spec.mean, spec.std, spec.rescale);
  return { data: buf, canvas };
}

/** Row image from the canvas (white background, black ink) -> tensor data. */
export function buildInputFromBitmap(
  bitmap: ImageBitmap, spec: PreprocessSpec, padFraction: number, thicken = 1,
) {
  const { width: W, height: H } = spec;
  const { canvas, ctx, buf } = ensure(W, H);
  const iw = W * (1 - 2 * padFraction);
  const ih = H * (1 - 2 * padFraction);
  const scale = Math.min(iw / bitmap.width, ih / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, dx, dy, dw, dh);

  // Grow the ink a little: a shrunk row has thinner lines than the model was tested with.
  const t = Math.max(0, Math.round(thicken));
  if (t > 0) {
    ctx.globalCompositeOperation = 'darken';
    for (let k = 1; k <= t; k++) {
      for (const [ox, oy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) {
        ctx.drawImage(bitmap, dx + ox, dy + oy, dw, dh);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  const img = ctx.getImageData(0, 0, W, H);
  fillTensorData(img.data, buf, W * H, spec.mean, spec.std, spec.rescale);
  return { data: buf, canvas };
}
