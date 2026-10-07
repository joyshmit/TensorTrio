export const WORLD_W = 1600;
export const WORLD_H = 900;

// Fit the board inside the window, centred. Never enlarge past 1:1.
export function computeView(winW, winH, margin = 12) {
  const scale = Math.min(
    1,
    (winW - margin * 2) / WORLD_W,
    (winH - margin * 2) / WORLD_H
  );
  return {
    scale,
    left: (winW - WORLD_W * scale) / 2,
    top: (winH - WORLD_H * scale) / 2,
  };
}

// Screen position (clientX/Y) -> board position
export function toWorld(clientX, clientY, view) {
  return { x: (clientX - view.left) / view.scale, y: (clientY - view.top) / view.scale };
}