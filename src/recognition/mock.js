export async function recognize(bitmap) {
  await new Promise((r) => setTimeout(r, 300));
  // just past the right edge of the writing, vertically centred
  return [{ text: '10', x: bitmap.width + 10, y: bitmap.height * 0.55 }];
}