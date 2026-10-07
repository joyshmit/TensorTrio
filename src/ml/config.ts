const BASE = import.meta.env.BASE_URL; // keep '/' (not './') so worker URLs resolve

export const CONFIG = {
  MODELS_ROOT: `${BASE}models/`,
  MODEL_NAME: "pix2text-mfr",
  MODEL_DIR: `${BASE}models/pix2text-mfr/`,
  ENCODER_FILE: "encoder_model.onnx",
  DECODER_FILE: "decoder_model.onnx",
  WASM_DIR: BASE,

  // Render defaults (the test page can override these live)
  FIT_MODE: "letterbox" as "letterbox" | "stretch",
  PAD_FRACTION: 0.06,
  STROKE_FRACTION: 0.014, // line width as a fraction of the model image size
  INVERT: false, // false = black ink on white

  MAX_NEW_TOKENS: 48, // an arithmetic expression is short
  MAX_REPEAT: 8, // stop if one token repeats this many times in a row
  DEBOUNCE_MS: 250,
  DEBUG_PREVIEW: false, // worker sends back the image the model sees
};
