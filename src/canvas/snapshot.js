export async function snapshotInk(baseCanvas, strokes, worldWidth, pad = 16) {
  const pen = strokes.filter((s) => s.tool === 'pen');
  if (pen.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of pen) {
    for (const p of s.points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }

  const dpr = baseCanvas.width / worldWidth; // canvas pixels per board unit
  const sx = Math.max(0, Math.floor((minX - pad) * dpr));
  const sy = Math.max(0, Math.floor((minY - pad) * dpr));
  const sw = Math.min(baseCanvas.width - sx, Math.ceil((maxX - minX + pad * 2) * dpr));
  const sh = Math.min(baseCanvas.height - sy, Math.ceil((maxY - minY + pad * 2) * dpr));
  if (sw <= 0 || sh <= 0) return null;

  const off = new OffscreenCanvas(sw, sh);
  const octx = off.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, sw, sh);
  octx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  return {
    bitmap: off.transferToImageBitmap(),
    box: { x: sx / dpr, y: sy / dpr, w: sw / dpr, h: sh / dpr }, // board units
  };
}

export async function snapshotLine(baseCanvas, line, worldWidth, pad = 16) {
  const dpr = baseCanvas.width / worldWidth;
  const x0 = Math.max(0, line.minX - pad);
  const x1 = line.maxX + pad;
  const y0 = Math.max(line.minY - pad, line.topLimit);
  const y1 = Math.min(line.maxY + pad, line.bottomLimit);

  const sx = Math.floor(x0 * dpr);
  const sy = Math.floor(y0 * dpr);
  const sw = Math.min(baseCanvas.width - sx, Math.ceil((x1 - x0) * dpr));
  const sh = Math.min(baseCanvas.height - sy, Math.ceil((y1 - y0) * dpr));
  if (sw <= 0 || sh <= 0) return null;

  const off = new OffscreenCanvas(sw, sh);
  const octx = off.getContext('2d');
  octx.fillStyle = '#fff';
  octx.fillRect(0, 0, sw, sh);
  octx.drawImage(baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  return {
    bitmap: off.transferToImageBitmap(),
    box: { x: sx / dpr, y: sy / dpr, w: sw / dpr, h: sh / dpr },
  };
}