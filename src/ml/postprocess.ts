/** LaTeX from the model -> the plain expression alphabet for the evaluator. */
export function latexToExpression(raw: string): {
  text: string;
  clean: boolean;
} {
  let s = raw;
  // simple numeric fractions only
  s = s.replace(/\\frac\{([0-9.]+)\}\{([0-9.]+)\}/g, "$1÷$2");
  s = s
    .replace(/\\(?:times|cdot|ast)(?![a-zA-Z])/g, "×")
    .replace(/\\(?:div|colon)(?![a-zA-Z])/g, "÷")
    .replace(/\\[,;! ]/g, "")
    .replace(/\\(?:left|right|quad|qquad)(?![a-zA-Z])/g, "");

  let clean = !/\\[a-zA-Z]+/.test(s); // any command still left is unsupported
  s = s.replace(/\\[a-zA-Z]+/g, "");

  s = s
    .replace(/[−–—]/g, "-")
    .replace(/[*xX]/g, "×")
    .replace(/[:/]/g, "÷")
    .replace(/[{}\s]/g, "");

  const text = s.replace(/[^0-9+\-×÷.=]/g, "");
  if (text.length !== s.length) clean = false; // characters were dropped
  return { text, clean };
}
