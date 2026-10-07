// Splits one handwritten row into horizontal chunks so the model never sees a row that is
// far wider than it is tall. The model works on a square image: a long row squeezed into it
// ends up with glyphs only a few pixels high, which is why long expressions were misread.
//
// Cuts are only made in the empty vertical gaps between strokes, so a digit, a bracket or a
// fraction (bar + numerator + denominator) is never cut in half.

function strokeSpan(s) {
  let minX = Infinity, maxX = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  const half = (s.width ?? 0) / 2;
  return [minX - half, maxX + half];
}

// Merge overlapping x-ranges into clusters, left to right.
function clusters(strokes) {
  const spans = strokes.map(strokeSpan).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of spans) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * @param line  a row from groupLines(): { strokes, minX, maxX, minY, maxY }
 * @param opts  maxAspect: widest allowed chunk, as width / height of the cropped image
 *              pad: the padding snapshotLine adds around the ink (counted in the aspect)
 * @returns     [{ x0, x1 }] board-unit x ranges, left to right. One range = no split needed.
 */
export function splitLine(line, { maxAspect = 6, pad = 16 } = {}) {
  const whole = [{ x0: line.minX, x1: line.maxX }];
  const height = line.maxY - line.minY + 2 * pad;
  const maxWidth = maxAspect * height - 2 * pad; // widest ink span that still fits
  const total = line.maxX - line.minX;
  if (!(maxWidth > 0) || total <= maxWidth) return whole;

  const cl = clusters(line.strokes);
  if (cl.length < 2) return whole;

  // candidate cuts: the middle of each gap between neighbouring clusters
  const gaps = [];
  for (let i = 0; i + 1 < cl.length; i++) {
    gaps.push({ at: (cl[i][1] + cl[i + 1][0]) / 2, size: cl[i + 1][0] - cl[i][1] });
  }

  // Use a fixed target size so chunks don't shift when new strokes are added on the right.
  const target = 0.8 * maxWidth;
  const cuts = [];
  let from = line.minX;
  while (true) {
    const want = from + target;
    const ahead = gaps.filter((g) => g.at > from + 1e-6);
    if (ahead.length === 0) break;
    // prefer the widest gap near the target position, else the nearest gap
    const near = ahead.filter((g) => Math.abs(g.at - want) <= 0.25 * target);
    const pick = near.length
      ? near.reduce((a, b) => (b.size > a.size ? b : a))
      : ahead.reduce((a, b) => (Math.abs(b.at - want) < Math.abs(a.at - want) ? b : a));
    // only cut if there is still ink on both sides of the cut
    if (pick.at >= line.maxX) break;
    cuts.push(pick.at);
    from = pick.at;
  }
  if (cuts.length === 0) return whole;

  const edges = [line.minX, ...cuts, line.maxX];
  const chunks = [];
  for (let i = 0; i + 1 < edges.length; i++) chunks.push({ x0: edges[i], x1: edges[i + 1] });
  return chunks;
}
