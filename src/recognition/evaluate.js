// Temporary evaluator. Same contract as the teammate's future evaluate():
//   { ok: true, value } | { ok: false, error: 'div0' | 'invalid' }
// Once src/math/execute.js exports evaluate(), replace this file's content with:
//   export { evaluate } from '../math/execute.js';
export function evaluate(expr) {
  const s = String(expr).replace(/\s+/g, '');
  let i = 0;
  const fail = (error) => { throw { error }; };

  function parseExpr() {
    let v = parseTerm();
    while (s[i] === '+' || s[i] === '-') {
      const op = s[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm() {
    let v = parseUnary();
    while (s[i] === '*' || s[i] === '/') {
      const op = s[i++];
      const r = parseUnary();
      if (op === '*') v *= r;
      else { if (r === 0) fail('div0'); v /= r; }
    }
    return v;
  }
  function parseUnary() {
    if (s[i] === '-') { i++; return -parseUnary(); }
    return parseNumber();
  }
  function parseNumber() {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (!m) fail('invalid');
    i += m[0].length;
    return parseFloat(m[0]);
  }

  try {
    if (!s) return { ok: false, error: 'invalid' };
    const v = parseExpr();
    if (i !== s.length || !Number.isFinite(v)) return { ok: false, error: 'invalid' };
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, error: e && e.error ? e.error : 'invalid' };
  }
}
