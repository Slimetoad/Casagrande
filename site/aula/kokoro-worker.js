const KOKORO_CDN_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let ttsInstance = null;
let activeDevice = null;
let initPromise = null;

function clampSpeed(speed) {
  const numeric = Number(speed);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1.6, Math.max(0.65, numeric));
}

function splitSpanishChunks(rawText, maxChars = 210) {
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
    if (merged.length > 0 && seg.length < 32 && merged[merged.length - 1].length + 1 + seg.length <= maxChars) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${seg}`;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

function concatFloat32Chunks(chunks, samplingRate, pauseSeconds) {
  const pauseSamples = Math.max(0, Math.round(samplingRate * pauseSeconds));
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

async function initKokoro(requestedDevice) {
  if (ttsInstance) {
    self.postMessage({ type: 'ready', device: activeDevice || 'wasm' });
    return ttsInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const mod = await import(KOKORO_CDN_URL);
    const KokoroTTS = mod.KokoroTTS || (mod.default && mod.default.KokoroTTS);
    if (!KokoroTTS || typeof KokoroTTS.from_pretrained !== 'function') {
      throw new Error('KokoroTTS module export not available');
    }

    const candidates = [];
    if (requestedDevice === 'wasm') {
      candidates.push('wasm');
    } else {
      const webgpuAvailable = await hasWorkingWebGPU();
      if (requestedDevice === 'webgpu' || webgpuAvailable) {
        if (webgpuAvailable) candidates.push('webgpu');
      }
      candidates.push('wasm');
    }

    let lastError = null;
    for (const candidate of candidates) {
      try {
        postProgress({ status: `init-${candidate}`, progress: 0, file: '' });
        const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
          dtype: 'q8',
          device: candidate,
          progress_callback: postProgress
        });
        ttsInstance = instance;
        activeDevice = candidate;
        self.postMessage({ type: 'ready', device: activeDevice });
        return ttsInstance;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Unable to load Kokoro-82M on WebGPU or WASM');
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
}

async function handleSpeak(msg) {
  const id = msg.id;
  const text = String(msg.text || '').trim();
  const voice = String(msg.voice || 'ef_dora');
  const speed = clampSpeed(msg.speed);

  if (!text) {
    const empty = new Float32Array(0);
    self.postMessage(
      {
        type: 'audio',
        id,
        audioBuffer: empty.buffer,
        length: 0,
        samplingRate: 24000
      },
      [empty.buffer]
    );
    return;
  }

  const tts = await initKokoro(msg.device);
  const chunks = splitSpanishChunks(text);
  const audioArrays = [];
  let samplingRate = 24000;

  for (const chunk of chunks) {
    const generated = await tts.generate(chunk, { voice, speed });
    const samples = generated && generated.audio
      ? generated.audio
      : (generated && generated.data ? generated.data : null);

    if (!samples || !samples.length) continue;

    const floatChunk = samples instanceof Float32Array ? samples : new Float32Array(samples);
    audioArrays.push(floatChunk);
    if (generated && Number.isFinite(generated.sampling_rate)) {
      samplingRate = generated.sampling_rate;
    } else if (generated && Number.isFinite(generated.samplingRate)) {
      samplingRate = generated.samplingRate;
    }
  }

  if (audioArrays.length === 0) {
    throw new Error('Kokoro-82M returned empty audio');
  }

  const pauseSec = speed > 1.08 ? 0.08 : 0.13;
  const combined = concatFloat32Chunks(audioArrays, samplingRate, pauseSec);

  self.postMessage(
    {
      type: 'audio',
      id,
      audioBuffer: combined.buffer,
      length: combined.length,
      samplingRate
    },
    [combined.buffer]
  );
}

self.addEventListener('message', async (event) => {
  const msg = event && event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'init') {
    try {
      await initKokoro(msg.device);
    } catch (err) {
      self.postMessage({
        type: 'error',
        id: null,
        message: err && err.message ? err.message : 'Error inicializando Kokoro-82M'
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
        message: err && err.message ? err.message : 'Error sintetizando voz Kokoro-82M'
      });
    }
  }
});
