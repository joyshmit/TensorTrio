/** Argmax over the last sequence position of a [1, L, V] logits array. */
export function argmaxLastRow(
  logits: Float32Array,
  seqLen: number,
  vocab: number,
): number {
  const base = (seqLen - 1) * vocab;
  let best = 0,
    bestVal = -Infinity;
  for (let v = 0; v < vocab; v++) {
    const x = logits[base + v];
    if (x > bestVal) {
      bestVal = x;
      best = v;
    }
  }
  return best;
}

/** True when the same token was generated `maxRepeat` times in a row (runaway decoding). */
export function hasRunawayRepeat(ids: number[], maxRepeat: number): boolean {
  if (ids.length < maxRepeat) return false;
  const last = ids[ids.length - 1];
  for (let i = 1; i <= maxRepeat; i++)
    if (ids[ids.length - i] !== last) return false;
  return true;
}
