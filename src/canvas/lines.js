function bounds(s) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of s.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Group pen strokes into rows by vertical overlap.
export function groupLines(strokes) {
  const items = strokes
    .filter((s) => s.tool === 'pen' && s.points.length > 0)
    .map((s) => ({ s, b: bounds(s) }))
    .sort((a, b) => a.b.minY - b.b.minY);

  const lines = [];
  for (const { s, b } of items) {
    const cy = (b.minY + b.maxY) / 2;
    const line = lines.find((L) => {
      const overlap = Math.min(L.maxY, b.maxY) - Math.max(L.minY, b.minY);
      const smaller = Math.min(L.maxY - L.minY, b.maxY - b.minY);
      return (cy >= L.minY && cy <= L.maxY) || overlap >= 0.5 * smaller;
    });
    if (line) {
      line.strokes.push(s);
      line.minX = Math.min(line.minX, b.minX);
      line.minY = Math.min(line.minY, b.minY);
      line.maxX = Math.max(line.maxX, b.maxX);
      line.maxY = Math.max(line.maxY, b.maxY);
    } else {
      lines.push({ strokes: [s], ...b });
    }
  }
  lines.sort((a, b) => a.minY - b.minY);

  const erasers = strokes
    .filter((s) => s.tool === 'eraser' && s.points.length > 0)
    .map((s) => ({ s, b: bounds(s) }));

  lines.forEach((L, i) => {
    // crop limits so a snapshot never includes a neighbouring row
    const prev = lines[i - 1], next = lines[i + 1];
    L.topLimit = prev ? Math.min((prev.maxY + L.minY) / 2, L.minY) : 0;
    L.bottomLimit = next ? Math.max((L.maxY + next.minY) / 2, L.maxY) : Infinity;

    // signature: changes only if this row's ink changes
    const pad = 16;
    const hits = erasers
      .filter(({ s, b }) =>
        b.maxX + s.width / 2 >= L.minX - pad && b.minX - s.width / 2 <= L.maxX + pad &&
        b.maxY + s.width / 2 >= L.minY - pad && b.minY - s.width / 2 <= L.maxY + pad)
      .map(({ s }) => s.id);
    L.sig = L.strokes.map((s) => s.id).sort((a, b) => a - b).join(',') + '|' + hits.join(',');
  });
  return lines;
}