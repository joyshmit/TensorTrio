import { strokes, startStroke, addPoint, commitStroke, clearAll, undo, redo, setOnChange } from './canvas/strokes.js';

const baseCanvas = document.getElementById('base'); // finished strokes
const liveCanvas = document.getElementById('live'); // stroke being drawn
const baseCtx = baseCanvas.getContext('2d');
const liveCtx = liveCanvas.getContext('2d', { desynchronized: true }); // lower stylus latency
// const liveCtx = liveCanvas.getContext('2d');

const PEN_WIDTH = 3;
let currentStroke = null;
let drawnIndex = 0;      // last point already painted on the live canvas
let frameQueued = false;

// ---------- sizing (sharp on high-DPI screens) ----------
function setup(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function redrawBase() {
  baseCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  strokes.forEach((s) => paint(baseCtx, s, 0));
}

function resize() {
  setup(baseCanvas, baseCtx);
  setup(liveCanvas, liveCtx);
  redrawBase();
}
// ---------- drawing ----------
// Paint a stroke starting from point index `from`
function paint(ctx, stroke, from) {
  const pts = stroke.points;
  if (pts.length === 0) return;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.moveTo(pts[from].x, pts[from].y);
  for (let i = from + 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y); // tap = dot
  ctx.stroke();
}

// Runs at most once per screen refresh
function frame() {
  frameQueued = false;
  if (!currentStroke) return;
  const last = currentStroke.points.length - 1;
  if (last >= drawnIndex) {
    paint(liveCtx, currentStroke, drawnIndex); // only the NEW segments
    drawnIndex = last;
  }
}

function queueFrame() {
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(frame);
  }
}

// ---------- pointer input (only saves data, never draws) ----------
liveCanvas.addEventListener('pointerdown', (e) => {
  liveCanvas.setPointerCapture(e.pointerId);
  currentStroke = startStroke(e.clientX, e.clientY, e.pressure, PEN_WIDTH);
  drawnIndex = 0;
  queueFrame();
});

liveCanvas.addEventListener('pointermove', (e) => {
  if (!currentStroke) return;
  // coalesced events = every tiny movement between frames
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of events) addPoint(currentStroke, ev.clientX, ev.clientY, ev.pressure);
  queueFrame();
});

function endStroke() {
  if (!currentStroke) return;
  frame(); // paint any leftover points
  liveCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const done = currentStroke;
  currentStroke = null;
  commitStroke(done); // redraws the back canvas through setOnChange
}

liveCanvas.addEventListener('pointerup', endStroke);
liveCanvas.addEventListener('pointercancel', endStroke);

resize();
window.addEventListener('resize', resize);
window.strokes = strokes; // so you can type `strokes` in the console



// ---------- undo / redo / clear ----------
// Any change to the strokes redraws the back canvas once
setOnChange(() => {
  redrawBase();
  // later: tell the recognition code that the drawing changed
});

function guarded(fn) {
  return () => { if (!currentStroke) fn(); };  // ignore while drawing
}

document.getElementById('undoBtn').onclick = guarded(undo);
document.getElementById('redoBtn').onclick = guarded(redo);
document.getElementById('clearBtn').onclick = guarded(clearAll);

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); guarded(undo)(); }
  else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); guarded(redo)(); }
});