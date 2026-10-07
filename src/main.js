import '@fontsource/caveat/400.css';
import {
  strokes, startStroke, addPoint, commitStroke, eraseStroke, commitRemoval,
  clearAll, undo, redo, setOnChange,
} from './canvas/strokes.js';
import { strokeHit } from './canvas/hitTest.js';
// import { snapshotInk } from './canvas/snapshot.js';
import { WORLD_W, WORLD_H, computeView, toWorld } from './canvas/coords.js';
import { recognize } from './recognition/onnx.js';
import { snapshotLine } from './canvas/snapshot.js';
import { groupLines } from './canvas/lines.js';

const boardEl = document.getElementById('board');
const baseCanvas = document.getElementById('base');
const liveCanvas = document.getElementById('live');
const answerCanvas = document.getElementById('answers');
const baseCtx = baseCanvas.getContext('2d');
const liveCtx = liveCanvas.getContext('2d');
const answerCtx = answerCanvas.getContext('2d');

let penWidth = 3;
const PIXEL_ERASER_WIDTH = 24;
const STROKE_ERASER_RADIUS = 8;

let tool = 'pen';
let currentStroke = null;
let erasingStrokes = false;
let removedThisDrag = [];
let drawnIndex = 0;
let frameQueued = false;
let lastResults = [];
let view = computeView(window.innerWidth, window.innerHeight);

const busy = () => currentStroke !== null || erasingStrokes;

// ---------- sizing: fixed board, scaled to fit, sharp on high-DPI ----------
function setup(canvas, ctx) {
  const ratio = (window.devicePixelRatio || 1) * view.scale;
  canvas.width = Math.round(WORLD_W * ratio);
  canvas.height = Math.round(WORLD_H * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // all drawing uses board units
}

function resize() {
  view = computeView(window.innerWidth, window.innerHeight);
  Object.assign(boardEl.style, {
    left: view.left + 'px',
    top: view.top + 'px',
    width: WORLD_W * view.scale + 'px',
    height: WORLD_H * view.scale + 'px',
  });
  setup(baseCanvas, baseCtx);
  setup(liveCanvas, liveCtx);
  setup(answerCanvas, answerCtx);
  redrawBase();
  renderAnswers(lastResults, 1, 0);
}

function redrawBase() {
  baseCtx.clearRect(0, 0, WORLD_W, WORLD_H);
  strokes.forEach((s) => paint(baseCtx, s, 0));
}

// ---------- drawing (smoothed with quadratic curves) ----------
function paint(ctx, stroke, from) {
  const pts = stroke.points;
  const n = pts.length - 1;
  if (n < 0) return;

  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a1a1a';
  ctx.beginPath();

  if (n === 0) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
  } else {
    if (from === 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
    } else {
      ctx.moveTo((pts[from - 1].x + pts[from].x) / 2, (pts[from - 1].y + pts[from].y) / 2);
    }
    for (let i = Math.max(from, 1); i < n; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[n].x, pts[n].y);
  }

  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function frame() {
  frameQueued = false;
  if (!currentStroke) return;
  const last = currentStroke.points.length - 1;
  if (last >= drawnIndex) {
    const target = currentStroke.tool === 'eraser' ? baseCtx : liveCtx;
    paint(target, currentStroke, drawnIndex);
    drawnIndex = last;
  }
}

function queueFrame() {
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(frame);
  }
}

// ---------- stroke eraser ----------
function eraseAt(x, y) {
  let changed = false;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s.tool !== 'pen') continue;
    if (strokeHit(s, x, y, STROKE_ERASER_RADIUS)) {
      removedThisDrag.push(eraseStroke(s));
      changed = true;
    }
  }
  if (changed) redrawBase();
}

// ---------- pointer input ----------
liveCanvas.addEventListener('pointerdown', (e) => {
  liveCanvas.setPointerCapture(e.pointerId);
  const p = toWorld(e.clientX, e.clientY, view);
  if (tool === 'stroke-eraser') {
    erasingStrokes = true;
    removedThisDrag = [];
    eraseAt(p.x, p.y);
    return;
  }
  const isEraser = tool === 'pixel-eraser';
  currentStroke = startStroke(
    p.x, p.y, e.pressure,
    isEraser ? PIXEL_ERASER_WIDTH : penWidth,
    isEraser ? 'eraser' : 'pen'
  );
  drawnIndex = 0;
  queueFrame();
});

liveCanvas.addEventListener('pointermove', (e) => {
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  if (erasingStrokes) {
    for (const ev of events) {
      const p = toWorld(ev.clientX, ev.clientY, view);
      eraseAt(p.x, p.y);
    }
    return;
  }
  if (!currentStroke) return;
  for (const ev of events) {
    const p = toWorld(ev.clientX, ev.clientY, view);
    addPoint(currentStroke, p.x, p.y, ev.pressure);
  }
  queueFrame();
});

function endStroke() {
  if (erasingStrokes) {
    erasingStrokes = false;
    commitRemoval(removedThisDrag);
    removedThisDrag = [];
    return;
  }
  if (!currentStroke) return;
  frame();
  liveCtx.clearRect(0, 0, WORLD_W, WORLD_H);
  const done = currentStroke;
  currentStroke = null;
  commitStroke(done);
}

liveCanvas.addEventListener('pointerup', endStroke);
liveCanvas.addEventListener('pointercancel', endStroke);

// ---------- tools ----------
const toolButtons = {
  'pen': document.getElementById('penBtn'),
  'stroke-eraser': document.getElementById('strokeEraserBtn'),
  'pixel-eraser': document.getElementById('pixelEraserBtn'),
};

function setTool(name) {
  if (busy()) return;
  tool = name;
  for (const [key, btn] of Object.entries(toolButtons)) {
    btn.classList.toggle('active', key === name);
  }
  liveCanvas.style.cursor = name === 'pen' ? 'crosshair' : 'cell';
  if (navigator.vibrate) navigator.vibrate(10);
}

for (const [key, btn] of Object.entries(toolButtons)) {
  btn.onclick = () => setTool(key);
}

// ---------- stroke width ----------
const widthSlider = document.getElementById('widthSlider');
const widthLabel = document.getElementById('widthLabel');
widthSlider.addEventListener('input', () => {
  penWidth = Number(widthSlider.value);
  widthLabel.textContent = penWidth;
});
widthSlider.addEventListener('change', () => widthSlider.blur());

// ---------- answers ----------
let fadeFrame = null;

var typesetOn = true;            // false while the user draws or erases, so the handwriting is visible
var typesetShown = new Set();    // rows whose typed line has already faded in (no replay)
function renderAnswers(results, alpha, rise) {
  answerCtx.clearRect(0, 0, WORLD_W, WORLD_H);
  answerCtx.textBaseline = 'alphabetic';

  const MARGIN = 16;
  const typeset = typesetOn !== false;

  // Rows shown as typed text: the handwritten-style answer next to them is skipped.
  const covered = new Set();
  if (typeset) for (const r of results) if (r.typeset && r.box) covered.add(r.box);

  // 1) Typed rows: the handwriting fades out first, then the typed line fades in.
  if (typeset) {
    const SIZE_MIN = 44, SIZE_MAX = 72;      // font size range of the typed line
    const FAMILY = '"Segoe UI", system-ui, sans-serif';
    for (const r of results) {
      if (!r.typeset || !r.box) continue;
      const b = r.box;
      const settled = typesetShown.has(r.sig);
      const a = settled ? 1 : alpha;
      const rs = settled ? 0 : rise;

      answerCtx.globalAlpha = Math.min(1, a * 2);
      answerCtx.fillStyle = '#fbf8f1';       // same colour as the paper
      answerCtx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);

      const eq = r.expr + ' = ';
      const x0 = Math.max(MARGIN, b.x + 16);
      let size = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, b.h * 0.5)));
      const widthAt = (s) => {
        answerCtx.font = `${s}px ${FAMILY}`;
        const w1 = answerCtx.measureText(eq).width;
        answerCtx.font = `600 ${s}px ${FAMILY}`;
        return w1 + answerCtx.measureText(r.answer).width;
      };
      while (size > 24 && x0 + widthAt(size) > WORLD_W - MARGIN) size -= 2;

      const y = Math.min(b.y + b.h / 2 + size * 0.35, WORLD_H - MARGIN) + rs;
      answerCtx.globalAlpha = Math.max(0, a * 2 - 1);
      answerCtx.font = `${size}px ${FAMILY}`;
      answerCtx.fillStyle = '#1f2937';
      answerCtx.fillText(eq, x0, y);
      const eqW = answerCtx.measureText(eq).width;
      answerCtx.font = `600 ${size}px ${FAMILY}`;
      answerCtx.fillStyle = /^undefined$/i.test(r.answer) ? '#b5655f' : '#2563a8';
      answerCtx.fillText(r.answer, x0 + eqW, y);
    }
    if (alpha >= 1) { // animation finished: remember these rows, forget removed ones
      const live = new Set();
      for (const r of results) if (r.typeset && r.sig !== undefined) { typesetShown.add(r.sig); live.add(r.sig); }
      for (const s of typesetShown) if (!live.has(s)) typesetShown.delete(s);
    }
  }

  // 2) Answers next to rows that are not (yet) typed.
  answerCtx.font = '48px "Caveat", "Segoe Print", cursive';
  for (const r of results) {
    if (r.typeset || (r.box && covered.has(r.box))) continue;
    const undef = r.isError || /^undefined$/i.test(r.text);
    const w = answerCtx.measureText(r.text).width;

    let x = r.x + 8;
    let y = r.y + 12;

    // no room on the right: go below the end of the equation
    if (x + w > WORLD_W - MARGIN) {
      x = r.x - w;
      y = (r.bottom ?? r.y + 40) + 40;
    }

    x = Math.max(MARGIN, Math.min(x, WORLD_W - MARGIN - w));
    y = Math.min(y, WORLD_H - MARGIN);

    answerCtx.fillStyle = undef ? '#b5655f' : '#2563a8';
    answerCtx.globalAlpha = alpha;
    answerCtx.fillText(r.text, x, y + rise);
  }
  answerCtx.globalAlpha = 1;
}

function setResults(results) {
  cancelAnimationFrame(fadeFrame);
  lastResults = results;
  if (results.length === 0) {
    answerCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    return;
  }
  const start = performance.now();
  const DURATION = 700;
  function step(now) {
    const p = Math.min(1, (now - start) / DURATION);
    const eased = 1 - Math.pow(1 - p, 3);
    renderAnswers(results, eased, (1 - eased) * 8);
    if (p < 1) fadeFrame = requestAnimationFrame(step);
  }
  fadeFrame = requestAnimationFrame(step);
}

// ---------- recognition hand-off (one call per row) ----------
let version = 0;
let timer = null;
const cache = new Map(); // row signature -> answers for that row

function showCached(lines) {
  const all = [];
  for (const L of lines) if (cache.has(L.sig)) all.push(...cache.get(L.sig));
  setResults(all);
}

function scheduleRecognition() {
  const myVersion = ++version;
  clearTimeout(timer);
  showCached(groupLines(strokes)); // unchanged rows keep their answers

  timer = setTimeout(async () => {
    if (busy()) return;
    const lines = groupLines(strokes);
    const live = new Set(lines.map((L) => L.sig));
    for (const key of cache.keys()) if (!live.has(key)) cache.delete(key); // no leaks

    for (const line of lines) {
      if (cache.has(line.sig)) continue;
      const snap = await snapshotLine(baseCanvas, line, WORLD_W);
      if (!snap) continue;
      try {
        const results = await recognize(snap.bitmap);
        if (myVersion !== version) return; // drawing changed, a newer run takes over
        const { box } = snap;
        const scale = box.w / snap.bitmap.width;
        cache.set(line.sig, results.map((r) => ({
          text: r.text,
          x: box.x + r.x * scale,
          y: box.y + r.y * scale,
          bottom: box.y + box.h,
        box,
        sig: line.sig,
        typeset: r.typeset,
        isError: r.isError,
        expr: r.expr,
        answer: r.answer,
        })));
        showCached(lines);
      } catch (err) {
        console.error('Recognition failed:', err);
      } finally {
        snap.bitmap.close();
      }
    }
  }, 400);
}
// ---------- undo / redo / clear ----------
setOnChange(() => {
  redrawBase();
  scheduleRecognition();
});

function guarded(fn) {
  return () => { if (!busy()) fn(); };
}

document.getElementById('undoBtn').onclick = guarded(undo);
document.getElementById('redoBtn').onclick = guarded(redo);
document.getElementById('clearBtn').onclick = guarded(clearAll);

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); guarded(undo)(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); guarded(redo)(); }
    return;
  }
  if (key === 'p') setTool('pen');
  else if (key === 's') setTool('stroke-eraser');
  else if (key === 'e') setTool('pixel-eraser');
});

// ---------- start ----------
resize();
window.addEventListener('resize', resize);
window.strokes = strokes; // debug: type `strokes` in the console

// ---------- typed-line mode ----------
// While the user draws or erases, show the handwriting again; the typed line returns after they stop.
let typesetTimer = null;
document.getElementById('live').addEventListener('pointerdown', () => {
  clearTimeout(typesetTimer);
  if (typesetOn === false) return;
  typesetOn = false;
  cancelAnimationFrame(fadeFrame);
  renderAnswers(lastResults, 1, 0);
});
const resumeTypeset = () => {
  if (typesetOn !== false) return;
  clearTimeout(typesetTimer);
  typesetTimer = setTimeout(() => {
    typesetOn = true;
    setResults(lastResults);
  }, 1200);
};
window.addEventListener('pointerup', resumeTypeset);
window.addEventListener('pointercancel', resumeTypeset);
