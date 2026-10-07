import * as ort from 'onnxruntime-web';
import { AutoTokenizer, env as tfEnv } from '@xenova/transformers';
import { CONFIG } from './config';
import {
  buildInput, buildInputFromBitmap, parsePreprocessorConfig, DEFAULT_OPTS,
  type PreprocessSpec, type RenderOpts, type Stroke,
} from './preprocess';
import { argmaxLastRow, hasRunawayRepeat } from './decode';
import { latexToExpression } from './postprocess';

const post = (m: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfer);
const abs = (p: string) => new URL(p, self.location.href).href;

// transformers.js sets a CDN wasm path when imported, so override AFTER the imports.
ort.env.wasm.wasmPaths = abs(CONFIG.WASM_DIR);
const cores = navigator.hardwareConcurrency || 2;
const threads = self.crossOriginIsolated ? Math.min(4, Math.max(1, cores - 1)) : 1;
ort.env.wasm.numThreads = threads;
console.log('[ML] crossOriginIsolated:', self.crossOriginIsolated, '| cores:', cores, '| threads:', threads);
tfEnv.allowRemoteModels = false; // never touch the network
tfEnv.allowLocalModels = true;
tfEnv.localModelPath = abs(CONFIG.MODELS_ROOT);

type Req = {
  id: number;
  strokes?: Stroke[];
  bitmap?: ImageBitmap;
  thicken?: number;
  opts?: Partial<RenderOpts>;
};

let enc: ort.InferenceSession | null = null;
let dec: ort.InferenceSession | null = null;
let tokenizer: any = null;
let spec: PreprocessSpec;
let startId = 0;
let eosIds: number[] = [];
let initStarted = false;

let busy = false;
let pending: Req | null = null; // latest request wins

async function getJson(name: string, optional = false) {
  const r = await fetch(abs(CONFIG.MODEL_DIR + name));
  if (!r.ok) {
    if (optional) return null;
    throw new Error(`Cannot load ${name} (HTTP ${r.status}). Is it in public/models/${CONFIG.MODEL_NAME}/ ?`);
  }
  return r.json();
}

async function init() {
  if (initStarted) return;
  initStarted = true;
  try {
    const pre = await getJson('preprocessor_config.json');
    const cfg = await getJson('config.json');
    const gen = await getJson('generation_config.json', true);
    spec = parsePreprocessorConfig(pre);

    const pick = (...v: any[]) => v.find((x) => x !== undefined && x !== null);
    const start = pick(gen?.decoder_start_token_id, cfg?.decoder_start_token_id,
      cfg?.decoder?.decoder_start_token_id, cfg?.decoder?.bos_token_id);
    const eos = pick(gen?.eos_token_id, cfg?.eos_token_id, cfg?.decoder?.eos_token_id);
    if (start === undefined || eos === undefined) {
      throw new Error('decoder_start_token_id / eos_token_id not found in config.json or generation_config.json');
    }
    startId = start;
    eosIds = Array.isArray(eos) ? eos : [eos];

    const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' } as ort.InferenceSession.SessionOptions;
    enc = await ort.InferenceSession.create(abs(CONFIG.MODEL_DIR + CONFIG.ENCODER_FILE), opts);
    dec = await ort.InferenceSession.create(abs(CONFIG.MODEL_DIR + CONFIG.DECODER_FILE), opts);
    tokenizer = await AutoTokenizer.from_pretrained(CONFIG.MODEL_NAME);

    post({
      type: 'READY',
      info: {
        encoderInputs: enc.inputNames, encoderOutputs: enc.outputNames,
        decoderInputs: dec.inputNames, decoderOutputs: dec.outputNames,
        size: [spec.width, spec.height], mean: spec.mean, std: spec.std, rescale: spec.rescale,
        startId, eosIds, threads,
      },
    });
  } catch (e: any) {
    initStarted = false;
    post({ type: 'ERROR', id: -1, message: `Init failed: ${e?.message ?? e}` });
  }
}

const superseded = (id: number) =>
  post({ type: 'RESULT', id, raw: '', text: '', clean: false, superseded: true });

/** Returns false if abandoned because a newer request arrived. */
async function recognize(req: Req): Promise<boolean> {
  if (!enc || !dec || !tokenizer) throw new Error('Model not ready');
  const o: RenderOpts = { ...DEFAULT_OPTS, ...(req.opts ?? {}) };
  const t0 = performance.now();

  const input = req.bitmap
    ? buildInputFromBitmap(req.bitmap, spec, o.padFraction, req.thicken)
    : req.strokes ? buildInput(req.strokes, spec, o) : null;
  if (!input) {
    post({ type: 'RESULT', id: req.id, raw: '', text: '', clean: true });
    return true;
  }
  if (CONFIG.DEBUG_PREVIEW && !req.bitmap) {
    const bmp = await createImageBitmap(input.canvas);
    post({ type: 'PREVIEW', id: req.id, bitmap: bmp }, [bmp]);
  }
  const pixel = new ort.Tensor('float32', input.data, [1, 3, spec.height, spec.width]);
  const t1 = performance.now();

  const encOut = await enc.run({ [enc.inputNames[0]]: pixel });
  const hidden = encOut[enc.outputNames[0]];
  const S = hidden.dims[1];
  const t2 = performance.now();

  const ids: number[] = [startId];
  for (let step = 0; step < CONFIG.MAX_NEW_TOKENS; step++) {
    if (pending) { superseded(req.id); return false; } // newer request arrived: drop this work

    const L = ids.length;
    const available: Record<string, ort.Tensor> = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids.map((v) => BigInt(v))), [1, L]),
      encoder_hidden_states: hidden,
      encoder_attention_mask: new ort.Tensor('int64', new BigInt64Array(S).fill(BigInt(1)), [1, S]),
      attention_mask: new ort.Tensor('int64', new BigInt64Array(L).fill(BigInt(1)), [1, L]),
    };
    const feeds: Record<string, ort.Tensor> = {};
    for (const name of dec.inputNames) {
      if (!(name in available)) {
        throw new Error(`Decoder needs input "${name}" which this worker does not provide. Decoder inputs: ${dec.inputNames.join(', ')}`);
      }
      feeds[name] = available[name];
    }

    const out = await dec.run(feeds);
    const logits = out['logits'] ?? out[dec.outputNames[0]];
    const [, Lout, V] = logits.dims as number[];
    const next = argmaxLastRow(logits.data as Float32Array, Lout, V);
    if (eosIds.includes(next)) break;
    ids.push(next);
    if (hasRunawayRepeat(ids, CONFIG.MAX_REPEAT)) break;
  }
  const t3 = performance.now();

  const raw: string = String(tokenizer.decode(ids.slice(1), { skip_special_tokens: true })).trim();
  const { text, clean } = latexToExpression(raw);
  post({
    type: 'RESULT', id: req.id, raw, text, clean,
    timing: { preprocessMs: t1 - t0, encodeMs: t2 - t1, decodeMs: t3 - t2, tokens: ids.length - 1 },
  });
  return true;
}

async function drain() {
  busy = true;
  while (pending) {
    const req: Req = pending;
    pending = null;
    try { await recognize(req); }
    catch (e: any) { post({ type: 'ERROR', id: req.id, message: e?.message ?? String(e) }); }
    finally { req.bitmap?.close(); } // free the image: no leaks
  }
  busy = false;
}

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;
  if (type === 'INIT') void init();
  else if (type === 'RECOGNIZE') {
    if (pending) { // an older request is being replaced: free it and tell its caller
      pending.bitmap?.close();
      superseded(pending.id);
    }
    pending = payload;
    if (!busy) void drain();
  }
};
