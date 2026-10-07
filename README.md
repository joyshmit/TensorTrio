# CalcInk by TensorTrio

CalcInk is a responsive, fully on-device digital notebook that transforms a passive sketching surface into an interactive computational environment. 

Designed for low-latency handwritten mathematical evaluation, the application allows users to write equations (e.g., `(2 + 3) × 4 =`) using a mouse, stylus, or touch. The system continuously captures the strokes, interprets the sequence of handwritten characters using an on-device machine learning model, calculates the arithmetic result via a custom parser, and projects the evaluated answer directly onto the canvas in real time. The architecture natively supports reactive editing, meaning modifications to existing equations trigger instantaneous, deterministic re-evaluations.

## Key Features

* **Fluid Digital Ink Canvas:** High-performance drawing locked at 60 FPS utilizing **custom Bezier curve interpolation** to ensure smooth, natural stroke rendering with zero perceptible input lag. Features include full utility controls (undo/redo history, stroke/pixel erasers, dynamic display scaling) optimized for high-DPI/Retina viewports.
* **100% On-Device Machine Learning:** Operates strictly with zero cloud APIs. The entire recognition pipeline—from stroke capture to neural network inference—executes locally within the browser, guaranteeing data privacy and complete offline functionality.
* **Reactive Editing & Caching:** Built to function as an interactive scratchpad. If a user modifies an equation, the system dynamically isolates the edited region, processes only the changed input, and updates the canvas inline.
* **Deterministic Math Engine:** A custom-built arithmetic parser that rigorously respects BODMAS/PEMDAS precedence. It provides robust support for multi-digit integers, floating-point decimals, and negative numbers.

---

## Architecture & Pipeline Optimization

Maintaining a 60 FPS real-time rendering loop while executing heavy machine learning inference in the browser requires strict architectural separation and optimization. 

### 1. Non-Blocking WebWorker Inference
To ensure canvas rendering remains decoupled from neural network computation, all machine learning inference is offloaded to a background WebWorker environment. 
* The main thread is strictly reserved for canvas interactions and UI state management.
* The `ONNX Runtime Web` instance, running the **`breezedeus/pix2text-mfr`** model, operates entirely in the background. 
* If a user initiates a new stroke while the model is processing a previous input, the outdated inference job is immediately superseded to optimize CPU resource allocation.

### 2. Stable Chunking & Caching for Long Expressions
Machine learning models optimized for square inputs suffer from severe accuracy degradation when evaluating long, highly compressed equations. We engineered a resolution-preserving pipeline to address this:
* **Stable Slicing:** A custom segmentation algorithm (`segments.js`) calculates optimal cut points within empty stroke gaps, dividing long expressions into proportional chunks.
* **Optimized Latency:** We implemented a stateful caching mechanism (`pieceCache`). The system assigns a unique geometric signature to each chunk. Unchanged chunks are loaded instantly from memory, bypassing the inference engine entirely and reducing evaluation latency from several seconds to milliseconds.
* **Tuned Aspect Ratios:** The chunking threshold (`MAX_CHUNK_ASPECT = 10`) was rigorously calibrated to preserve local mathematical context for typical expressions while only splitting extremely wide edge cases.

### 3. Post-Processing & Error Mitigation
Handwritten data is inherently noisy, occasionally resulting in model hallucinations or syntax errors. We developed a comprehensive post-processing pipeline (`postprocess.ts`) to sanitize inference outputs before mathematical evaluation:
* **Character Normalization:** Automatically maps common optical character recognition (OCR) anomalies to their intended numerical equivalents (e.g., correcting `Z` to `2`, `Q` to `4`, and `l` to `1`).
* **Operator Resolution:** Hand-drawn addition symbols (`+`) frequently overlap visually with asterisks or stars. The pipeline safely normalizes unsupported LaTeX outputs like `\star` back to standard multiplication/addition logic.
* **Boundary Artifact Removal:** When long equations are segmented, the model occasionally hallucinates trailing or leading operators at the slice boundaries. The pipeline detects and surgically strips these mathematically invalid dangling operators.
* **Environment Stripping:** Overly large parentheses can trigger the model to wrap outputs in LaTeX matrix environments (e.g., `\begin{matrix}`). The system safely unwraps these layout commands to extract the core arithmetic syntax safely.

### 4. Secure Mathematical Evaluator
To comply with strict security constraints, the direct use of un-sanitized JavaScript `eval()` is avoided entirely.
* The system utilizes a custom, sandboxed math parser (`execute.js`).
* It implements the **Shunting-yard algorithm** to convert infix notation to Reverse Polish Notation (RPN) for secure stack evaluation.
* Edge cases, such as division by zero, syntax errors, and unbalanced parentheses, are caught gracefully without throwing unhandled runtime exceptions.

---

## Technology Stack

* **Frontend:** Vanilla JavaScript, HTML5 Canvas API, Vite
* **Machine Learning Runtime:** ONNX Runtime Web (`onnxruntime-web`), Transformers.js (`@xenova/transformers`)
* **Pre-Trained Model:** `breezedeus/pix2text-mfr` (Math Formula Recognition)
* **Testing:** Vitest

## Local Setup & Development

To deploy and execute the project locally:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/joyshmit/TensorTrio.git
   cd TensorTrio
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run the local development server:**
   ```bash
   npm run dev
   ```
4. **Run the automated test suite:**
   ```bash
   npm test
   ```
   *(The repository includes a comprehensive suite of 40+ unit tests covering the arithmetic parser, coordinate transformations, and segmentation logic to ensure high structural integrity.)*

---
