const NUMBER = /^[0-9.]+$/;
const wrap = (x: string) => (NUMBER.test(x) ? x : `(${x})`);

/**
 * \frac{a}{b} and {a \over b} -> a÷b, innermost first.
 * The result is parenthesised when the surrounding text would change its meaning
 * (e.g. 2÷\frac{3}{4} must become 2÷(3÷4), not 2÷3÷4).
 */
function convertFractions(input: string): string {
  const FRAC = /\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/;
  const OVER = /\{([^{}]*)\\over\s*([^{}]*)\}/;

  const build = (a: string, b: string, offset: number, str: string, len: number) => {
    const body = `${wrap(a.trim())}÷${wrap(b.trim())}`;
    const before = str.slice(0, offset).trimEnd().slice(-1);
    const after = str.slice(offset + len).trimStart().charAt(0);
    return before === "×" || before === "÷" || after === "^" ? `(${body})` : body;
  };

  let s = input;
  for (let i = 0; i < 10; i++) {
    const next = s
      .replace(FRAC, (m, a, b, off, str) => build(a, b, off, str, m.length))
      .replace(OVER, (m, a, b, off, str) => build(a, b, off, str, m.length));
    if (next === s) break;
    s = next;
  }
  return s;
}

/** LaTeX from the model -> the plain expression alphabet for the evaluator. */
export function latexToExpression(raw: string): {
  text: string;
  clean: boolean;
} {
  let s = raw;

  // sizing and spacing commands carry no meaning
  s = s
    .replace(/\\(?:left|right|[bB]ig{1,2}[lrm]?|quad|qquad)(?![a-zA-Z])/g, "")
    .replace(/\\[,;! ]/g, "");

  // every kind of bracket the model might use for a handwritten ( or )
  s = s
    .replace(/\\(?:lbrace|lbrack|lparen)(?![a-zA-Z])|\\\{|\[/g, "(")
    .replace(/\\(?:rbrace|rbrack|rparen)(?![a-zA-Z])|\\\}|\]/g, ")");

  // operators, including the look-alikes a formula model produces for handwriting
  s = s
    .replace(/\\(?:times|cdot|ast)(?![a-zA-Z])/g, "×")
    .replace(/\\(?:div|colon|slash|backslash|diagup|setminus)(?![a-zA-Z])/g, "÷")
    .replace(/\\(?:equiv|doteq|approx|simeq|asymp|cong|eqsim)(?![a-zA-Z])|:=/g, "=");

  s = convertFractions(s);

  // exponents: ^{3} -> ^3, ^{-1} -> ^(-1)
  s = s.replace(/\^\s*\{([^{}]*)\}/g, (_m, e: string) =>
    NUMBER.test(e.trim()) ? `^${e.trim()}` : `^(${e.trim()})`,
  );

  let clean = !/\\[a-zA-Z]+/.test(s); // any command still left is unsupported
  s = s.replace(/\\[a-zA-Z]+/g, "");

  s = s
    .replace(/[−–—]/g, "-")
    .replace(/[*xX]/g, "×")
    .replace(/[:/]/g, "÷")
    .replace(/[{}\s]/g, "")
    .replace(/={2,}/g, "=");

  let text = s.replace(/[^0-9+\-×÷.=()^]/g, "");
  if (text.length !== s.length) clean = false; // characters were dropped

  // implicit multiplication: 2(3+4) and (1+2)(3+4) and (1+2)3
  text = text
    .replace(/([0-9.)])\(/g, "$1×(")
    .replace(/\)([0-9.])/g, ")×$1");

  return { text, clean };
}
