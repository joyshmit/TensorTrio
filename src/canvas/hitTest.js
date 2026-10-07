// Distance from point (px,py) to the line segment a-b
export function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

// Bounding box, calculated once and cached (cheap rejection test)
function getBox(stroke) {
  if (!stroke._box) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of stroke.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    stroke._box = { minX, minY, maxX, maxY };
  }
  return stroke._box;
}

// Is the point within `radius` of the stroke?
export function strokeHit(stroke, x, y, radius) {
  const r = radius + stroke.width / 2;
  const b = getBox(stroke);
  if (x < b.minX - r || x > b.maxX + r || y < b.minY - r || y > b.maxY + r) return false; // fast reject
  const pts = stroke.points;
  if (pts.length === 1) return Math.hypot(x - pts[0].x, y - pts[0].y) <= r;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1], pts[i]) <= r) return true;
  }
  return false;
}