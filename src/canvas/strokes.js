export const strokes = [];
const undoStack = [];
const redoStack = [];
let nextId = 1;
let onChange = () => {};

export function setOnChange(fn) { onChange = fn; }

export function startStroke(x, y, pressure, width, tool = 'pen') {
  return {
    id: nextId++,
    tool,                       // 'pen' or 'eraser' (pixel eraser)
    width,
    points: [{ x, y, pressure, t: performance.now() }],
  };
}

export function addPoint(stroke, x, y, pressure) {
  stroke.points.push({ x, y, pressure, t: performance.now() });
}

export function commitStroke(stroke) {
  strokes.push(stroke);
  undoStack.push({ type: 'add', stroke });
  redoStack.length = 0;
  onChange();
}

// Stroke eraser: remove one stroke right now, remember where it was
export function eraseStroke(stroke) {
  const index = strokes.indexOf(stroke);
  strokes.splice(index, 1);
  return { stroke, index };
}

// Called when the eraser drag ends: all removed strokes = ONE undo step
export function commitRemoval(records) {
  if (records.length === 0) return;
  undoStack.push({ type: 'remove', records });
  redoStack.length = 0;
  onChange();
}

export function clearAll() {
  if (strokes.length === 0) return;
  const removed = strokes.splice(0);
  undoStack.push({ type: 'clear', removed });
  redoStack.length = 0;
  onChange();
}

export function undo() {
  const action = undoStack.pop();
  if (!action) return false;
  if (action.type === 'add') strokes.splice(strokes.indexOf(action.stroke), 1);
  else if (action.type === 'clear') strokes.push(...action.removed);
  else if (action.type === 'remove') {
    for (let i = action.records.length - 1; i >= 0; i--) {
      const { stroke, index } = action.records[i];
      strokes.splice(index, 0, stroke);        // put it back where it was
    }
  }
  redoStack.push(action);
  onChange();
  return true;
}

export function redo() {
  const action = redoStack.pop();
  if (!action) return false;
  if (action.type === 'add') strokes.push(action.stroke);
  else if (action.type === 'clear') strokes.splice(0);
  else if (action.type === 'remove') {
    for (const { stroke } of action.records) strokes.splice(strokes.indexOf(stroke), 1);
  }
  undoStack.push(action);
  onChange();
  return true;
}