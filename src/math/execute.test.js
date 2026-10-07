import { describe, it, expect } from 'vitest';
import { evaluate } from './execute.js';

const val = (e) => { const r = evaluate(e); return r.ok ? r.value : r; };
const err = (e) => { const r = evaluate(e); return r.ok ? 'ok' : r.error; };

describe('evaluate: results', () => {
  it('follows operator precedence (BODMAS)', () => {
    expect(val('18+4*3')).toBe(30);
    expect(val('4+2*3')).toBe(10);
    expect(val('2*3+4')).toBe(10);
  });
  it('evaluates equal-precedence operators left to right', () => {
    expect(val('10-2-3')).toBe(5);
    expect(val('8/4/2')).toBe(1);
  });
  it('supports multi-digit numbers and decimals', () => {
    expect(val('100-45')).toBe(55);
    expect(val('7.5/2')).toBeCloseTo(3.75);
    expect(val('0.5+0.25')).toBeCloseTo(0.75);
  });
  it('supports negative numbers', () => {
    expect(val('-3+5')).toBe(2);
    expect(val('-1.111+0.11')).toBeCloseTo(-1.001);
  });
  it('supports parentheses', () => {
    expect(val('(1+2)*3')).toBe(9);
  });
  it('does not leak state between calls', () => {
    expect(val('1+1')).toBe(2);
    expect(val('2*3')).toBe(6);
    expect(val('1+1')).toBe(2);
  });
});

describe('evaluate: error types', () => {
  it('division by zero gives div0 with a clear message', () => {
    expect(evaluate('5/0')).toEqual({ ok: false, error: 'div0', message: 'Cannot divide by zero' });
    expect(err('1/(2-2)')).toBe('div0');
    expect(err('0/0')).toBe('div0');
  });
  it('a missing operand gives syntax', () => {
    for (const bad of ['18+', '*', '()', '1+*2']) expect(err(bad)).toBe('syntax');
  });
  it('a malformed number gives number', () => {
    for (const bad of ['1..2', '1.2.3']) expect(err(bad)).toBe('number');
  });
  it('unbalanced parentheses give parens', () => {
    for (const bad of ['(1+2', '1+2)', ')(']) expect(err(bad)).toBe('parens');
  });
  it('unsupported characters give chars', () => {
    for (const bad of ['abc', '1+a', '@#', '1,5']) expect(err(bad)).toBe('chars');
  });
  it('empty input gives empty', () => {
    for (const bad of ['', '   ']) expect(err(bad)).toBe('empty');
  });
  it('every error carries a readable message', () => {
    for (const bad of ['5/0', '18+', '1..2', '(1', 'abc', '']) {
      const r = evaluate(bad);
      expect(r.ok).toBe(false);
      expect(typeof r.message).toBe('string');
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
  it('never throws and never returns NaN or Infinity', () => {
    for (const x of ['1/0', '1..2', '((', 'abc', '1+*2', '-', '--1', '.', '..', '+', '1e5']) {
      expect(() => evaluate(x)).not.toThrow();
      const r = evaluate(x);
      if (r.ok) expect(Number.isFinite(r.value)).toBe(true);
      else expect(r.message).toBeTruthy();
    }
  });
});
