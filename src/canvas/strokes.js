export const strokes = [];      // strokes currently on the page
const undoStack = [];           // actions that can be undone
const redoStack = [];           // actions that can be redone
let nextId = 1;
let onChange = () => {};

export function setOnChange(fn) { onChange = fn; }

export function startStroke(x, y, pressure, width) {
  return {
    id: nextId++,
    tool: 'pen',
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
  redoStack.length = 0;          // a new stroke ends the redo history
  onChange();
}

export function clearAll() {
  if (strokes.length === 0) return;
  const removed = strokes.splice(0);   // empties the array in place
  undoStack.push({ type: 'clear', removed });
  redoStack.length = 0;
  onChange();
}

export function undo() {
  const action = undoStack.pop();
  if (!action) return false;
  if (action.type === 'add') strokes.splice(strokes.indexOf(action.stroke), 1);
  else if (action.type === 'clear') strokes.push(...action.removed);
  redoStack.push(action);
  onChange();
  return true;
}

export function redo() {
  const action = redoStack.pop();
  if (!action) return false;
  if (action.type === 'add') strokes.push(action.stroke);
  else if (action.type === 'clear') strokes.splice(0);
  undoStack.push(action);
  onChange();
  return true;
}