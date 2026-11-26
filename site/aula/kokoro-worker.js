const KOKORO_CDN_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const ESPEAK_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@echogarden/espeak-ng-emscripten@0.3.5/';
const ESPEAK_CDN_URL = `${ESPEAK_CDN_BASE}+esm`;
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE_BASE_URL = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';

const SAMPLING_RATE = 24000;
const CHUNK_PAUSE_SAMPLES = 3360; // ~0.14s at 24000 Hz
const MAX_VOICE_FRAMES = 510;
const VOICE_DIM = 256;

let ttsInstance = null;
let activeDevice = null;
let espeakWorker = null;
let phonemizerKind = 'rules-es';
let initPromise = null;

const voiceCache = new Map();
const voiceFetchPromises = new Map();

function clampSpeed(speed) {
  const numeric = Number(speed);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1.6, Math.max(0.65, numeric));
}

function splitSpanishSentences(rawText, maxChars = 240) {
  const cleaned = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];

  const rawSentences = cleaned.match(/[^.!?…]+[.!?…]*|[^.!?…]+$/g) || [cleaned];
  const segments = [];

  for (const rawSentence of rawSentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length <= maxChars) {
      segments.push(sentence);
      continue;
    }

    const clauses = sentence.match(/[^,;:\u2014]+[,;:\u2014]*|[^,;:\u2014]+$/g) || [sentence];
    let current = '';
    for (const rawClause of clauses) {
      const clause = rawClause.trim();
      if (!clause) continue;
      if (!current) {
        current = clause;
      } else if (current.length + 1 + clause.length <= maxChars) {
        current = `${current} ${clause}`;
      } else {
        segments.push(current);
        current = clause;
      }
    }
    if (current) segments.push(current);
  }

  const merged = [];
  for (const seg of segments) {
    if (merged.length > 0 && seg.length < 36 && merged[merged.length - 1].length + 1 + seg.length <= maxChars) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${seg}`;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

function concatFloat32Chunks(chunks, pauseSamples = CHUNK_PAUSE_SAMPLES) {
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    totalLength += chunks[i].length;
    if (i < chunks.length - 1) totalLength += pauseSamples;
  }

  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    combined.set(chunks[i], offset);
    offset += chunks[i].length;
    if (i < chunks.length - 1) {
      offset += pauseSamples;
    }
  }
  return combined;
}

function hasVocabChar(vocab, ch) {
  if (!vocab) return true;
  if (vocab instanceof Map || vocab instanceof Set) return vocab.has(ch);
  if (Array.isArray(vocab)) return vocab.includes(ch);
  return Object.prototype.hasOwnProperty.call(vocab, ch);
}

function normalizeAndFilterIpa(ipa, vocab) {
  const normalized = String(ipa || '')
    .replace(/_+/g, '')
    .replace(/t\u0361?ʃ/g, 'ʧ')
    .replace(/d\u0361?ʒ/g, 'ʤ')
    .replace(/[’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  let filtered = '';
  for (const ch of normalized) {
    if (ch === ' ' || hasVocabChar(vocab, ch)) {
      filtered += ch;
    }
  }
  return filtered.replace(/\s+/g, ' ').trim();
}

function spanishRulesToIpa(clauseText) {
  const lower = String(clauseText || '').toLowerCase().trim();
  if (!lower) return '';

  const words = lower.split(/\s+/);
  const outWords = [];

  for (const word of words) {
    let w = word;
    if (!w) continue;
    let res = '';
    let i = 0;
    while (i < w.length) {
      const ch = w[i];
      const next = w[i + 1] || '';
      const next2 = w[i + 2] || '';

      if (ch === 'c' && next === 'h') {
        res += 'ʧ';
        i += 2;
      } else if (ch === 'l' && next === 'l') {
        res += 'ʝ';
        i += 2;
      } else if (ch === 'r' && next === 'r') {
        res += 'r';
        i += 2;
      } else if (ch === 'q' && next === 'u' && (next2 === 'e' || next2 === 'é' || next2 === 'i' || next2 === 'í')) {
        res += 'k';
        i += 2;
      } else if (ch === 'g' && next === 'u' && (next2 === 'e' || next2 === 'é' || next2 === 'i' || next2 === 'í')) {
        res += 'ɡ';
        i += 2;
      } else if (ch === 'c' && (next === 'e' || next === 'é' || next === 'i' || next === 'í')) {
        res += 's';
        i += 1;
      } else if (ch === 'g' && (next === 'e' || next === 'é' || next === 'i' || next === 'í')) {
        res += 'x';
        i += 1;
      } else if (ch === 'h') {
        i += 1;
      } else if (ch === 'j') {
        res += 'x';
        i += 1;
      } else if (ch === 'ñ') {
        res += 'ɲ';
        i += 1;
      } else if (ch === 'z') {
        res += 's';
        i += 1;
      } else if (ch === 'v') {
        res += 'b';
        i += 1;
      } else if (ch === 'x') {
        res += 'ks';
        i += 1;
      } else if (ch === 'y') {
        res += i === w.length - 1 ? 'i' : 'ʝ';
        i += 1;
      } else if (ch === 'r') {
        res += i === 0 || 'lns'.includes(w[i - 1] || '') ? 'r' : 'ɾ';
        i += 1;
      } else if (ch === 'c') {
        res += 'k';
        i += 1;
      } else if (ch === 'g') {
        res += 'ɡ';
        i += 1;
      } else if (ch === 'á') {
        res += 'ˈa';
        i += 1;
      } else if (ch === 'é') {
        res += 'ˈe';
        i += 1;
      } else if (ch === 'í') {
        res += 'ˈi';
        i += 1;
      } else if (ch === 'ó') {
        res += 'ˈo';
        i += 1;
      } else if (ch === 'ú' || ch === 'ü') {
        res += ch === 'ú' ? 'ˈu' : 'u';
        i += 1;
      } else {
        res += ch;
        i += 1;
      }
    }
    if (res) outWords.push(res);
  }

  return outWords.join(' ');
}

async function phonemizeClause(clauseText) {
  if (espeakWorker && typeof espeakWorker.synthesize_ipa === 'function') {
    try {
      const ipa = await espeakWorker.synthesize_ipa(clauseText, '');
      if (ipa && String(ipa).trim()) {
        return String(ipa);
      }
    } catch {
      // fall through to deterministic Spanish G2P rules
    }
  }
  return spanishRulesToIpa(clauseText);
}

async function phonemizeSpanishChunk(chunkText, vocab) {
  const parts = String(chunkText || '').split(/([,.!?;:\u2014…]+)/);
  const ipaParts = [];

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part) continue;

    if (/^[,.!?;:\u2014…]+$/.test(part)) {
      const normalizedPunct = part.replace(/\u2014/g, ',').replace(/…/g, '.');
      if (ipaParts.length > 0) {
        ipaParts[ipaParts.length - 1] = `${ipaParts[ipaParts.length - 1]}${normalizedPunct}`;
      }
      continue;
    }

    const trimmed = part.trim();
    if (!trimmed) continue;

    const rawIpa = await phonemizeClause(trimmed);
    const cleaned = normalizeAndFilterIpa(rawIpa, vocab);
    if (cleaned) {
      ipaParts.push(cleaned);
    }
  }

  const joined = ipaParts.join(' ').replace(/\s+/g, ' ').trim();
  return normalizeAndFilterIpa(joined, vocab);
}

async function hasWorkingWebGPU() {
  const gpu = self.navigator && self.navigator.gpu;
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
  try {
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

function postProgress(info) {
  self.postMessage({
    type: 'progress',
    status: info && info.status ? String(info.status) : 'loading',
    progress: info && typeof info.progress === 'number' ? info.progress : null,
    file: info && info.file ? String(info.file) : ''
  });
}

async function loadKokoroModel() {
  const mod = await import(KOKORO_CDN_URL);
  const KokoroTTS = mod.KokoroTTS || (mod.default && mod.default.KokoroTTS);
  if (!KokoroTTS || typeof KokoroTTS.from_pretrained !== 'function') {
    throw new Error('KokoroTTS module export not available');
  }

  const candidates = [];
  if (await hasWorkingWebGPU()) {
    candidates.push({ device: 'webgpu', dtype: 'fp32' });
  }
  candidates.push({ device: 'wasm', dtype: 'q8' });

  let lastError = null;
  for (const cfg of candidates) {
    try {
      postProgress({ status: `init-${cfg.device}`, progress: 0, file: '' });
      const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: cfg.dtype,
        device: cfg.device,
        progress_callback: postProgress
      });
      return { instance, device: cfg.device };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Unable to load Kokoro-82M on WebGPU or WASM');
}

async function loadEspeakPhonemizer() {
  try {
    const locateFile = (p) => `${ESPEAK_CDN_BASE}${String(p || '').replace(/^\/+/, '')}`;
    const espeakMod = await import(ESPEAK_CDN_URL);

    let WorkerCtor = null;
    if (typeof espeakMod.default === 'function') {
      const initialized = await espeakMod.default({ locateFile });
      WorkerCtor = (initialized && initialized.eSpeakNGWorker) || espeakMod.eSpeakNGWorker;
    } else {
      WorkerCtor = espeakMod.eSpeakNGWorker || (espeakMod.default && espeakMod.default.eSpeakNGWorker);
    }

    if (typeof WorkerCtor !== 'function') {
      throw new Error('eSpeakNGWorker export not found');
    }

    let workerInstance;
    try {
      workerInstance = new WorkerCtor();
    } catch {
      workerInstance = new WorkerCtor({ locateFile });
    }
    if (workerInstance && workerInstance.ready && typeof workerInstance.ready.then === 'function') {
      await workerInstance.ready;
    }
    if (typeof workerInstance.set_voice === 'function') {
      try {
        await workerInstance.set_voice('es-419');
      } catch {
        await workerInstance.set_voice('es');
      }
    }

    espeakWorker = workerInstance;
    phonemizerKind = 'espeak-ng-es-419';
    return espeakWorker;
  } catch (err) {
    console.warn('eSpeak-NG es-419 failed to load; using deterministic Spanish G2P fallback:', err);
    espeakWorker = null;
    phonemizerKind = 'rules-es';
    return null;
  }
}

async function fetchVoiceEmbedding(voiceId) {
  const safeVoice = String(voiceId || 'ef_dora').trim() || 'ef_dora';
  if (voiceCache.has(safeVoice)) {
    return voiceCache.get(safeVoice);
  }
  if (voiceFetchPromises.has(safeVoice)) {
    return voiceFetchPromises.get(safeVoice);
  }

  const promise = (async () => {
    const url = `${VOICE_BASE_URL}${encodeURIComponent(safeVoice)}.bin`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`No se pudo descargar la voz ${safeVoice} (HTTP ${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const floats = new Float32Array(buf);
    if (floats.length < VOICE_DIM) {
      throw new Error(`Archivo de voz inválido para ${safeVoice}`);
    }
    voiceCache.set(safeVoice, floats);
    return floats;
  })();

  voiceFetchPromises.set(safeVoice, promise);
  try {
    return await promise;
  } finally {
    voiceFetchPromises.delete(safeVoice);
  }
}

async function initKokoro() {
  if (ttsInstance) {
    self.postMessage({ type: 'ready', device: activeDevice || 'wasm', phonemizer: phonemizerKind });
    return ttsInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const [modelResult] = await Promise.all([
      loadKokoroModel(),
      loadEspeakPhonemizer(),
      fetchVoiceEmbedding('ef_dora')
    ]);

    ttsInstance = modelResult.instance;
    activeDevice = modelResult.device;
    self.postMessage({
      type: 'ready',
      device: activeDevice,
      phonemizer: phonemizerKind
    });
    return ttsInstance;
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

async function synthesizeIpaChunk(tts, voiceFloat32, ipaChunk, speed) {
  const { input_ids } = tts.tokenizer(ipaChunk, { truncation: true });
  const Tensor = input_ids.constructor;
  const dims = input_ids.dims || [];
  const tokenCount = dims.length > 0 ? dims[dims.length - 1] : 0;
  const availableFrames = Math.max(1, Math.floor(voiceFloat32.length / VOICE_DIM));
  const maxIdx = Math.min(MAX_VOICE_FRAMES - 1, availableFrames - 1);
  const styleIdx = Math.min(Math.max(tokenCount - 2, 0), maxIdx);
  const styleVec = voiceFloat32.slice(styleIdx * VOICE_DIM, (styleIdx + 1) * VOICE_DIM);

  const { waveform } = await tts.model({
    input_ids,
    style: new Tensor('float32', styleVec, [1, VOICE_DIM]),
    speed: new Tensor('float32', [speed], [1])
  });

  const rawData = waveform && waveform.data ? waveform.data : waveform;
  if (!rawData || !rawData.length) return new Float32Array(0);
  return rawData instanceof Float32Array ? rawData : new Float32Array(rawData);
}

async function handleSpeak(msg) {
  const id = msg.id;
  const text = String(msg.text || '').trim();
  const voice = String(msg.voice || 'ef_dora').trim() || 'ef_dora';
  const safeSpeed = clampSpeed(msg.speed);

  if (!text) {
    const empty = new Float32Array(0);
    self.postMessage(
      {
        type: 'audio',
        id,
        audioBuffer: empty.buffer,
        samplingRate: SAMPLING_RATE,
        voice,
        engine: 'kokoro-es',
        phonemizer: phonemizerKind
      },
      [empty.buffer]
    );
    return;
  }

  const [tts, voiceFloat32] = await Promise.all([
    initKokoro(),
    fetchVoiceEmbedding(voice)
  ]);

  const vocab = tts.tokenizer && tts.tokenizer.model && tts.tokenizer.model.vocab;
  const sentences = splitSpanishSentences(text, 240);
  const audioArrays = [];

  for (const sentence of sentences) {
    const ipaChunk = await phonemizeSpanishChunk(sentence, vocab);
    if (!ipaChunk) continue;
    const samples = await synthesizeIpaChunk(tts, voiceFloat32, ipaChunk, safeSpeed);
    if (samples.length > 0) {
      audioArrays.push(samples);
    }
  }

  if (audioArrays.length === 0) {
    throw new Error('Kokoro-82M Español no generó muestras de audio');
  }

  const out = concatFloat32Chunks(audioArrays, CHUNK_PAUSE_SAMPLES);
  self.postMessage(
    {
      type: 'audio',
      id,
      audioBuffer: out.buffer,
      samplingRate: SAMPLING_RATE,
      voice,
      engine: 'kokoro-es',
      phonemizer: phonemizerKind
    },
    [out.buffer]
  );
}

self.addEventListener('message', async (event) => {
  const msg = event && event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    try {
      await initKokoro();
    } catch (err) {
      self.postMessage({
        type: 'error',
        id: null,
        message: err && err.message ? err.message : 'Error inicializando Kokoro-82M Español'
      });
    }
    return;
  }

  if (msg.type === 'speak') {
    try {
      await handleSpeak(msg);
    } catch (err) {
      self.postMessage({
        type: 'error',
        id: msg.id ?? null,
        message: err && err.message ? err.message : 'Error sintetizando voz Kokoro-82M Español'
      });
    }
  }
});
