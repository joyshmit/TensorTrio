import { MathRecognizer } from '../ml/recognizer.ts';
import { evaluate } from '../math/execute.js';

// How much to thicken the ink before the model sees it (1 to 4). A row image is shrunk
// to fit the model, which makes the lines thinner than the model likes.
const THICKEN = 2;

// Created once at startup so the model loads while the user is still drawing.
const recognizer = new MathRecognizer(
  () => {},
  (s) => { if (s.error) console.error('[ML]', s.error); },
);

// Short wording shown on the canvas for each error type from evaluate().
const SHORT = {
  syntax: 'Missing operand',
  number: 'Invalid number',
  parens: 'Check brackets',
  chars: 'Unsupported symbol',
  empty: 'Nothing to calculate',
};

function formatValue(v) {
  return String(Number(v.toPrecision(12))); // 0.1+0.2 -> 0.3
}

// "18+4×3" -> "18 + 4 × 3"
function prettyExpression(body) {
  return body
    .replace(/([+×÷])/g, ' $1 ')
    .replace(/([0-9.])-/g, '$1 - ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Same contract as mock.js: bitmap in, [{ text, x, y }] out (coordinates inside the bitmap).
export async function recognize(bitmap) {
  const r = await recognizer.recognizeBitmap(bitmap, THICKEN);
  if (r.superseded || !r.clean) return [];

  const text = r.text;
  if (!text.endsWith('=')) return [];          // only answer finished equations
  const body = text.slice(0, -1);
  if (!body || body.includes('=')) return [];

  const out = evaluate(body.replace(/×/g, '*').replace(/÷/g, '/'));
  const x = bitmap.width + 10;
  const y = bitmap.height * 0.55;

  // A different message for each kind of invalid expression, shown next to the handwriting.
  if (!out.ok && out.error !== 'div0') {
    return [{ text: SHORT[out.error] ?? out.message, isError: true, x, y }];
  }

  const answer = out.ok ? formatValue(out.value) : 'Undefined'; // division by zero
  const expr = prettyExpression(body);
  return [
    // the answer, just past the right edge of the writing (used while the handwriting is visible)
    { text: answer, x, y },
    // the typed line that replaces the handwriting
    { text: `${expr} = ${answer}`, typeset: true, expr, answer, x: 0, y: 0 },
  ];
}
