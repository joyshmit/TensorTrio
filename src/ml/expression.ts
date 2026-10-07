// Turns the model's LaTeX into a plain expression using only: 0-9 + - × ÷ . ( ) =
// Brackets and "=" are kept (and LaTeX variants of them are normalised).
const ALLOWED = /^[0-9+\-×÷.()=]*$/;

export function latexToExpression(raw: string): { text: string; clean: boolean } {
  let s = raw;

  // size / spacing commands
  s = s
    .replace(/\\(left|right|bigg?|Bigg?)\b/g, '')
    .replace(/\\[,;:! ]/g, '')
    .replace(/\\(quad|qquad)\b/g, '');

  // brackets in all their forms
  s = s
    .replace(/\\(lbrace|lbrack|lparen|langle)\b|\\\{|\[|\{|⟨/g, '(')
    .replace(/\\(rbrace|rbrack|rparen|rangle)\b|\\\}|\]|\}|⟩/g, ')');

  // operators
  s = s
    .replace(/\\(times|cdot|ast|star)\b|\*|·|⋅/g, '×')
    .replace(/\\(div|over)\b|\/|:|\\frac/g, '÷')
    .replace(/\\(minus|-)|−|–|—|‐/g, '-')
    .replace(/\\(equiv|simeq|approx|doteq|triangleq|Rightarrow|rightarrow|to|coloneqq|eqqcolon|sim|cong)\b|≡|≈|≔|⇒|→/g, '=')
    .replace(/\\ne?q?\b/g, '');

  s = s.replace(/\s+/g, '');

  // a lowercase/upper "x" between digits or brackets is a multiplication sign
  s = s.replace(/(?<=[\d)])[xX](?=[\d(])/g, '×');

  // "2,5" -> "2.5"
  s = s.replace(/(?<=\d),(?=\d)/g, '.');

  // anything left that is not allowed is dropped, and flagged
  const filtered = s.replace(/[^0-9+\-×÷.()=]/g, '');
  const dropped = filtered.length !== s.length;

  // balanced brackets?
  let depth = 0, balanced = true;
  for (const ch of filtered) {
    if (ch === '(') depth++;
    else if (ch === ')' && --depth < 0) { balanced = false; break; }
  }
  if (depth !== 0) balanced = false;

  return {
    text: filtered,
    clean: filtered.length > 0 && ALLOWED.test(filtered) && !dropped && balanced,
  };
}