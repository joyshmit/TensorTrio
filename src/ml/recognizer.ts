import { CONFIG } from './config';
import type { RenderOpts, Stroke } from './preprocess';

export type RecognizeResult = {
  id: number; raw: string; text: string; clean: boolean; superseded?: boolean;
  timing?: { preprocessMs: number; encodeMs: number; decodeMs: number; tokens: number };
};
export type Status = { ready?: boolean; error?: string; info?: unknown };
type Waiter = { resolve: (r: RecognizeResult) => void; reject: (e: Error) => void };

export class MathRecognizer {
  private worker: Worker;
  private latestId = 0;
  private timer: number | undefined;
  private waiters = new Map<number, Waiter>();
  private onResult: (r: RecognizeResult) => void;
  private onStatus: (s: Status) => void;
  private readyResolve: () => void = () => {};
  private readyReject: (e: Error) => void = () => {};
  readonly whenReady: Promise<void>;
  onPreview?: (bmp: ImageBitmap) => void;
  ready = false;

  constructor(
    onResult: (r: RecognizeResult) => void = () => {},
    onStatus: (s: Status) => void = () => {},
  ) {
    this.onResult = onResult;
    this.onStatus = onStatus;
    this.whenReady = new Promise<void>((res, rej) => {
      this.readyResolve = res;
      this.readyReject = rej;
    });
    this.whenReady.catch(() => {}); // avoid an unhandled-rejection warning

    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'READY') {
        this.ready = true;
        this.readyResolve();
        this.onStatus({ ready: true, info: m.info });
      } else if (m.type === 'PREVIEW') {
        if (m.id === this.latestId) this.onPreview?.(m.bitmap); else m.bitmap.close();
      } else if (m.type === 'RESULT') {
        const r: RecognizeResult = {
          id: m.id, raw: m.raw, text: m.text, clean: m.clean,
          superseded: m.superseded, timing: m.timing,
        };
        const w = this.waiters.get(m.id);
        if (w) { this.waiters.delete(m.id); w.resolve(r); }
        if (m.id === this.latestId) this.onResult(r);
        if (import.meta.env.DEV && !m.superseded) console.debug('[ML]', r.raw, '->', r.text, r.timing);
      } else if (m.type === 'ERROR') {
        if (m.id === -1) this.readyReject(new Error(m.message));
        const w = this.waiters.get(m.id);
        if (w) { this.waiters.delete(m.id); w.reject(new Error(m.message)); }
        this.onStatus({ error: m.message });
      }
    };
    this.worker.onerror = (e) => this.onStatus({ error: `Worker error: ${e.message}` });
    this.worker.onmessageerror = () => this.onStatus({ error: 'Worker message error' });
    this.worker.postMessage({ type: 'INIT' });
  }

  /** Strokes path (used by the test page): debounced. */
  schedule(strokes: Stroke[], opts?: Partial<RenderOpts>, debounceMs = CONFIG.DEBOUNCE_MS) {
    clearTimeout(this.timer);
    if (strokes.length === 0) {
      this.latestId++;
      this.onResult({ id: this.latestId, raw: '', text: '', clean: true });
      return;
    }
    this.timer = window.setTimeout(() => {
      if (!this.ready) return;
      const id = ++this.latestId;
      this.worker.postMessage({ type: 'RECOGNIZE', payload: { id, strokes, opts } });
    }, debounceMs);
  }

  /** Strokes path, no debounce, resolves with the result. */
  recognizeNow(strokes: Stroke[], opts?: Partial<RenderOpts>): Promise<RecognizeResult> {
    return new Promise((resolve, reject) => {
      const id = ++this.latestId;
      this.waiters.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'RECOGNIZE', payload: { id, strokes, opts } });
    });
  }

  /** Image path (used by the team app): the caller keeps its own bitmap, we send a copy. */
  async recognizeBitmap(bitmap: ImageBitmap, thicken = 1): Promise<RecognizeResult> {
    await this.whenReady;
    const copy = await createImageBitmap(bitmap);
    return new Promise<RecognizeResult>((resolve, reject) => {
      const id = ++this.latestId;
      this.waiters.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'RECOGNIZE', payload: { id, bitmap: copy, thicken } }, [copy]);
    });
  }

  dispose() {
    clearTimeout(this.timer);
    this.worker.terminate();
  }
}
