import {
  strokes, startStroke, addPoint, commitStroke, eraseStroke, commitRemoval,
  clearAll, undo, redo, setOnChange,
} from './canvas/strokes.js';
import { strokeHit } from './canvas/hitTest.js';
import { snapshotInk } from './canvas/snapshot.js';
import { recognize } from './recognition/mock.js';

const baseCanvas = document.getElementById('base'); // finished ink
const liveCanvas = document.getElementById('live'); // stroke being drawn
const baseCtx = baseCanvas.getContext('2d');
const liveCtx = liveCanvas.getContext('2d');
const answerCanvas = document.getElementById('answers');
const answerCtx = answerCanvas.getContext('2d');

const PEN_WIDTH = 3;
const PIXEL_ERASER_WIDTH = 24;
const STROKE_ERASER_RADIUS = 8;

let tool = 'pen';                // 'pen' | 'stroke-eraser' | 'pixel-eraser'
let currentStroke = null;        // pen or pixel-eraser stroke in progress
let erasingStrokes = false;      // stroke eraser drag in progress
let removedThisDrag = [];
let drawnIndex = 0;
let frameQueued = false;

const busy = () => currentStroke !== null || erasingStrokes;

// ---------- sizing (sharp on high-DPI screens) ----------
function setup(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function redrawBase() {
  baseCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  strokes.forEach((s) => paint(baseCtx, s, 0)); // replays pen AND eraser strokes in order
}

function resize() {
  setup(baseCanvas, baseCtx);
  setup(liveCanvas, liveCtx);
  redrawBase();
  setup(answerCanvas, answerCtx);
}

// ---------- drawing ----------
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

  if (n === 0) {                       // a single tap = dot
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
  } else {
    // start where the previous batch of curves ended
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
    ctx.lineTo(pts[n].x, pts[n].y);    // short tail to the newest point
  }

  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

function frame() {
  frameQueued = false;
  if (!currentStroke) return;
  const last = currentStroke.points.length - 1;
  if (last >= drawnIndex) {
    // The pixel eraser rubs out the base canvas directly so you see it live
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
  if (tool === 'stroke-eraser') {
    erasingStrokes = true;
    removedThisDrag = [];
    eraseAt(e.clientX, e.clientY);
    return;
  }
  const isEraser = tool === 'pixel-eraser';
  currentStroke = startStroke(
    e.clientX, e.clientY, e.pressure,
    isEraser ? PIXEL_ERASER_WIDTH : PEN_WIDTH,
    isEraser ? 'eraser' : 'pen'
  );
  drawnIndex = 0;
  queueFrame();
});

liveCanvas.addEventListener('pointermove', (e) => {
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  if (erasingStrokes) {
    for (const ev of events) eraseAt(ev.clientX, ev.clientY);
    return;
  }
  if (!currentStroke) return;
  for (const ev of events) addPoint(currentStroke, ev.clientX, ev.clientY, ev.pressure);
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
  liveCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
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
  if (navigator.vibrate) navigator.vibrate(10); // haptic tick on supported phones
}

for (const [key, btn] of Object.entries(toolButtons)) {
  btn.onclick = () => setTool(key);
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
// ---------- recognition hand-off ----------
let version = 0;   // lets us ignore results that arrive after the drawing changed
let timer = null;
let lastResults = [];

function setResults(results) {
  lastResults = results;
  answerCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  answerCtx.font = '32px "Caveat", "Segoe Print", cursive';
  answerCtx.fillStyle = '#c0392b';
  answerCtx.textBaseline = 'middle';
  for (const r of results) answerCtx.fillText(r.text, r.x, r.y);
}

function scheduleRecognition() {
  const myVersion = ++version;
  clearTimeout(timer);
  setResults([]); // drawing changed, so the old answer is out of date
  timer = setTimeout(async () => {
    if (busy()) return;
    const snap = await snapshotInk(baseCanvas, strokes);
    if (!snap) return;
//     const preview = document.getElementById('preview') || Object.assign(document.createElement('canvas'), { id: 'preview' });
// preview.style.cssText = 'position:fixed;bottom:8px;right:8px;border:2px solid red;background:#fff;z-index:50;max-width:300px';
// preview.width = snap.bitmap.width;
// preview.height = snap.bitmap.height;
// preview.getContext('2d').drawImage(snap.bitmap, 0, 0);
// document.body.appendChild(preview);
    try {
      const results = await recognize(snap.bitmap);
      if (myVersion !== version) return; // user kept drawing, discard
      const { box } = snap;
      const scale = box.w / snap.bitmap.width;
      setResults(results.map((r) => ({
        text: r.text,
        x: box.x + r.x * scale,
        y: box.y + r.y * scale,
      })));
    } catch (err) {
      console.error('Recognition failed:', err);
    } finally {
      snap.bitmap.close(); // free memory
    }
  }, 400);
}

// ---------- start ----------
resize();
window.addEventListener('resize', resize);
window.strokes = strokes; // debug: type `strokes` in the console