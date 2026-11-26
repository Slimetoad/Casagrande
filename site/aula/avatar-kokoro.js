import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js';

export const VOICE_PROFILES = [
  { id: 'ef_dora', label: 'Dora · Español Natural (Kokoro-82M)', lang: 'es-EC', pitch: 1.04 },
  { id: 'em_alex', label: 'Alex · Español Claro (Kokoro-82M)', lang: 'es-EC', pitch: 0.96 },
  { id: 'em_santa', label: 'Santa · Narrador Profundo (Kokoro-82M)', lang: 'es-EC', pitch: 0.9 }
];

export const DEFAULT_AVATAR_URL =
  'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/brunette.glb';

const MAX_SYNTH_CACHE_ENTRIES = 32;

const MOOD_PRESETS = {
  neutral: { headTiltZ: 0.0, headPitchX: 0.0, smile: 0.14, browUp: 0.04, nodAmp: 0.014, haloHue: 0x58c4dd },
  curious: { headTiltZ: 0.08, headPitchX: -0.04, smile: 0.18, browUp: 0.34, nodAmp: 0.02, haloHue: 0x9a72ac },
  excited: { headTiltZ: -0.03, headPitchX: -0.02, smile: 0.42, browUp: 0.24, nodAmp: 0.035, haloHue: 0xf7c948 },
  emphatic: { headTiltZ: 0.02, headPitchX: 0.03, smile: 0.1, browUp: 0.28, nodAmp: 0.045, haloHue: 0x83c167 }
};

const VISEME_MORPH_KEYS = [
  'viseme_sil',
  'viseme_aa',
  'viseme_O',
  'viseme_E',
  'viseme_I',
  'viseme_U',
  'viseme_PP',
  'viseme_FF',
  'viseme_SS'
];

export function encodeWavBlob(float32Array, samplingRate = 24000) {
  const samples = float32Array instanceof Float32Array
    ? float32Array
    : new Float32Array(float32Array || 0);
  const rate = Number.isFinite(Number(samplingRate)) && Number(samplingRate) > 0
    ? Math.round(Number(samplingRate))
    : 24000;

  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = rate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeAscii(offset, text) {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let byteOffset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] || 0));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(byteOffset, int16, true);
    byteOffset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function stripSpanishAccents(ch) {
  const map = {
    á: 'a',
    é: 'e',
    í: 'i',
    ó: 'o',
    ú: 'u',
    ü: 'u',
    ñ: 'n'
  };
  return map[ch] || ch;
}

function buildSpanishVisemeTimeline(text, durationSec) {
  const cleanText = String(text || '').toLowerCase().trim();
  const safeDuration = Math.max(0.4, durationSec || 1.2);
  if (!cleanText) {
    return [{ t: 0, viseme: 'viseme_sil', open: 0 }];
  }

  const tokens = [];
  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = stripSpanishAccents(cleanText[i]);
    if (/[.,;:!?…]/.test(ch)) {
      tokens.push({ viseme: 'viseme_sil', open: 0.0, weight: 2.2 });
    } else if (/\s/.test(ch)) {
      tokens.push({ viseme: 'viseme_sil', open: 0.05, weight: 0.7 });
    } else if (ch === 'a') {
      tokens.push({ viseme: 'viseme_aa', open: 0.78, weight: 1.35 });
    } else if (ch === 'e') {
      tokens.push({ viseme: 'viseme_E', open: 0.56, weight: 1.2 });
    } else if (ch === 'i' || ch === 'y') {
      tokens.push({ viseme: 'viseme_I', open: 0.42, weight: 1.1 });
    } else if (ch === 'o') {
      tokens.push({ viseme: 'viseme_O', open: 0.68, weight: 1.3 });
    } else if (ch === 'u') {
      tokens.push({ viseme: 'viseme_U', open: 0.45, weight: 1.15 });
    } else if (ch === 'p' || ch === 'b' || ch === 'm') {
      tokens.push({ viseme: 'viseme_PP', open: 0.08, weight: 0.85 });
    } else if (ch === 'f' || ch === 'v') {
      tokens.push({ viseme: 'viseme_FF', open: 0.24, weight: 0.9 });
    } else if (ch === 's' || ch === 'z' || ch === 'c' || ch === 'x') {
      tokens.push({ viseme: 'viseme_SS', open: 0.28, weight: 0.95 });
    } else if (/[a-z]/.test(ch)) {
      tokens.push({ viseme: 'viseme_E', open: 0.34, weight: 0.85 });
    }
  }

  if (tokens.length === 0) {
    return [{ t: 0, viseme: 'viseme_sil', open: 0 }];
  }

  let totalWeight = 0;
  for (const tok of tokens) totalWeight += tok.weight;

  const timeline = [];
  let acc = 0;
  for (const tok of tokens) {
    timeline.push({
      t: (acc / totalWeight) * safeDuration,
      viseme: tok.viseme,
      open: tok.open
    });
    acc += tok.weight;
  }
  timeline.push({ t: safeDuration, viseme: 'viseme_sil', open: 0 });
  return timeline;
}

function sampleVisemeTimeline(timeline, elapsedSec) {
  if (!timeline || timeline.length === 0) {
    return { viseme: 'viseme_sil', open: 0 };
  }
  if (elapsedSec <= timeline[0].t) return timeline[0];
  let low = 0;
  let high = timeline.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (timeline[mid].t <= elapsedSec) low = mid;
    else high = mid - 1;
  }
  return timeline[low];
}

function getVoiceProfile(voiceId) {
  return VOICE_PROFILES.find((v) => v.id === voiceId) || VOICE_PROFILES[0];
}

export function createAvatarKokoroController(mountEl, callbacks = {}) {
  const {
    onVoiceStatus = null,
    onProgress = null,
    onSpeechStart = null,
    onSpeechEnd = null,
    onAvatarStatus = null
  } = callbacks || {};

  let currentVoiceId = VOICE_PROFILES[0].id;
  let currentMood = 'neutral';
  let currentAvatarUrl = DEFAULT_AVATAR_URL;
  let avatarMode = 'procedural';
  let destroyed = false;

  // Kokoro worker state
  let worker = null;
  let kokoroState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
  let kokoroDevice = null;
  let workerInitPromise = null;
  let resolveWorkerInit = null;
  let rejectWorkerInit = null;
  let workerRequestSeq = 0;
  const pendingSpeakRequests = new Map();
  const synthesisCache = new Map();
  const inflightSynthRequests = new Map();
  let lastAudio = null;

  // Web Audio playback state
  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let analyserData = null;
  let activeBufferSource = null;

  // Speech session state
  let speechToken = 0;
  let speaking = false;
  let paused = false;
  let activeSpeechEngine = null; // 'kokoro' | null
  let speechTimeline = [];
  let speechStartedMs = 0;
  let speechPausedAccumMs = 0;
  let speechPauseStartedMs = 0;
  let speechEndResolver = null;

  // Three.js / fallback visual state
  let stageInitialized = false;
  let webglAvailable = false;
  let renderer = null;
  let scene = null;
  let camera = null;
  let resizeObserver = null;
  let rafId = null;
  let gltfLoader = null;
  let proceduralGroup = null;
  let glbGroup = null;
  let glbLoadSeq = 0;

  // Procedural rig refs
  let procRig = null;
  // GLB rig refs
  let glbMorphMeshes = [];
  let glbHeadBone = null;
  let glbNeckBone = null;
  let glbSpineBone = null;
  let glbBaseRot = { head: null, neck: null, spine: null };
  let haloRing = null;
  let haloMat = null;
  let rimPointLight = null;
  let fallback2dMouth = null;
  let fallback2dBars = [];
  let fallback2dRing = null;

  // Animated facial smoothing state
  const animState = {
    rms: 0,
    jawOpen: 0,
    smile: 0.14,
    browUp: 0.04,
    blink: 0,
    nextBlinkAt: 0,
    blinkStartAt: -1,
    headRotX: 0,
    headRotY: 0,
    headRotZ: 0,
    visemes: {
      viseme_sil: 1,
      viseme_aa: 0,
      viseme_O: 0,
      viseme_E: 0,
      viseme_I: 0,
      viseme_U: 0,
      viseme_PP: 0,
      viseme_FF: 0,
      viseme_SS: 0
    }
  };

  function emitVoiceStatus(detail = {}) {
    if (typeof onVoiceStatus === 'function') {
      onVoiceStatus({
        state: kokoroState,
        device: kokoroDevice,
        voiceId: currentVoiceId,
        speaking,
        paused,
        engine: activeSpeechEngine,
        ...detail
      });
    }
  }

  function emitAvatarStatus(detail = {}) {
    if (typeof onAvatarStatus === 'function') {
      onAvatarStatus({
        mode: avatarMode,
        url: currentAvatarUrl,
        webgl: webglAvailable,
        ...detail
      });
    }
  }

  function ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) {
      audioCtx = new AudioCtx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 1;
      analyser.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      analyserData = new Uint8Array(analyser.fftSize);
    }
    return audioCtx;
  }

  function settleWorkerInitSuccess(device) {
    if (resolveWorkerInit) {
      const res = resolveWorkerInit;
      resolveWorkerInit = null;
      rejectWorkerInit = null;
      res({ ok: true, device });
    }
  }

  function settleWorkerInitFailure(message) {
    workerInitPromise = null;
    if (rejectWorkerInit) {
      const rej = rejectWorkerInit;
      resolveWorkerInit = null;
      rejectWorkerInit = null;
      rej(new Error(message));
    }
  }

  function ensureWorker() {
    if (destroyed || typeof Worker === 'undefined') return null;
    if (worker) return worker;

    const workerUrl = new URL('./kokoro-worker.js?v=kokoro-es-2', import.meta.url);
    worker = new Worker(workerUrl, { type: 'module' });

    worker.addEventListener('message', (event) => {
      const msg = event && event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'progress') {
        if (typeof onProgress === 'function') {
          onProgress({
            status: msg.status || 'loading',
            progress: typeof msg.progress === 'number' ? msg.progress : null,
            file: msg.file || ''
          });
        }
        return;
      }

      if (msg.type === 'ready') {
        kokoroState = 'ready';
        kokoroDevice = msg.device || 'wasm';
        if (typeof onProgress === 'function') {
          onProgress({ status: 'ready', progress: 100, file: '' });
        }
        emitVoiceStatus({ message: `Kokoro-82M Español listo (${kokoroDevice.toUpperCase()})` });
        settleWorkerInitSuccess(kokoroDevice);
        return;
      }

      if (msg.type === 'audio') {
        const pending = pendingSpeakRequests.get(msg.id);
        if (pending) {
          pendingSpeakRequests.delete(msg.id);
          const samples = msg.audioBuffer ? new Float32Array(msg.audioBuffer) : new Float32Array(0);
          pending.resolve({
            float32Array: samples,
            samplingRate: msg.samplingRate || 24000
          });
        }
        return;
      }

      if (msg.type === 'error') {
        const message = msg.message || 'Error en Kokoro-82M Español';
        if (msg.id && pendingSpeakRequests.has(msg.id)) {
          const pending = pendingSpeakRequests.get(msg.id);
          pendingSpeakRequests.delete(msg.id);
          pending.reject(new Error(message));
          return;
        }
        if (kokoroState !== 'ready') {
          kokoroState = 'error';
          emitVoiceStatus({ state: 'error', message });
          settleWorkerInitFailure(message);
        }
      }
    });

    worker.addEventListener('error', (err) => {
      const errMsg = err && err.message ? err.message : 'Error en Kokoro Worker';
      for (const [, pending] of pendingSpeakRequests.entries()) {
        pending.reject(new Error(errMsg));
      }
      pendingSpeakRequests.clear();
      if (kokoroState !== 'ready') {
        kokoroState = 'error';
        emitVoiceStatus({ state: 'error', message: errMsg });
        settleWorkerInitFailure(errMsg);
      }
    });

    return worker;
  }

  function ensureKokoroReady() {
    if (destroyed) {
      return Promise.reject(new Error('Controlador destruido'));
    }
    if (kokoroState === 'ready') {
      return Promise.resolve({ ok: true, device: kokoroDevice || 'wasm' });
    }
    if (kokoroState === 'error') {
      workerInitPromise = null;
    }
    if (workerInitPromise) {
      return workerInitPromise;
    }

    const w = ensureWorker();
    if (!w) {
      kokoroState = 'error';
      const msg = 'Web Worker no disponible en este navegador';
      emitVoiceStatus({ state: 'error', message: msg });
      return Promise.reject(new Error(msg));
    }

    kokoroState = 'loading';
    emitVoiceStatus({ message: 'Cargando Kokoro-82M Español (es-419)...' });

    workerInitPromise = new Promise((resolve, reject) => {
      resolveWorkerInit = resolve;
      rejectWorkerInit = reject;
      w.postMessage({ type: 'init' });
    });

    return workerInitPromise;
  }

  function requestKokoroSynthesis(text, voice, speed) {
    const w = ensureWorker();
    if (!w) return Promise.reject(new Error('Worker no disponible'));

    const id = ++workerRequestSeq;
    return new Promise((resolve, reject) => {
      pendingSpeakRequests.set(id, { resolve, reject });
      w.postMessage({ type: 'speak', id, text, voice, speed });
    });
  }

  function makeSynthCacheKey(text, voiceId, speed) {
    const safeSpeed = Number.isFinite(Number(speed)) ? Number(speed) : 1;
    return `${voiceId}|${safeSpeed.toFixed(2)}|${text}`;
  }

  function putSynthCache(key, value) {
    if (synthesisCache.has(key)) {
      synthesisCache.delete(key);
    } else if (synthesisCache.size >= MAX_SYNTH_CACHE_ENTRIES) {
      const oldestKey = synthesisCache.keys().next().value;
      if (oldestKey !== undefined) {
        synthesisCache.delete(oldestKey);
      }
    }
    synthesisCache.set(key, value);
  }

  async function getOrSynthesizeKokoroAudio(text, voiceId, speed) {
    const key = makeSynthCacheKey(text, voiceId, speed);
    if (synthesisCache.has(key)) {
      const cached = synthesisCache.get(key);
      // Touch for LRU order
      synthesisCache.delete(key);
      synthesisCache.set(key, cached);
      return cached;
    }
    if (inflightSynthRequests.has(key)) {
      return inflightSynthRequests.get(key);
    }

    const promise = requestKokoroSynthesis(text, voiceId, speed)
      .then((result) => {
        if (result && result.float32Array && result.float32Array.length > 0) {
          putSynthCache(key, result);
        }
        return result;
      })
      .finally(() => {
        inflightSynthRequests.delete(key);
      });

    inflightSynthRequests.set(key, promise);
    return promise;
  }

  function buildProceduralInstructorBust() {
    const group = new THREE.Group();
    group.position.set(0, 1.48, 0);

    const obsidianMat = new THREE.MeshPhysicalMaterial({
      color: 0x101a2e,
      metalness: 0.55,
      roughness: 0.28,
      clearcoat: 0.75,
      clearcoatRoughness: 0.2
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x58c4dd,
      emissive: 0x1a5670,
      emissiveIntensity: 0.9,
      metalness: 0.7,
      roughness: 0.25
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xf7c948,
      emissive: 0x5c4208,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.22
    });

    const visorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1324,
      metalness: 0.2,
      roughness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08
    });

    // Shoulders & sculpted collar
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, -0.22, 0);
    const shoulders = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.23, 0.22, 32), obsidianMat);
    shoulders.scale.set(1.25, 1, 0.72);
    torsoGroup.add(shoulders);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.011, 14, 42), trimMat);
    collar.rotation.x = Math.PI * 0.44;
    collar.position.set(0, 0.095, 0.01);
    torsoGroup.add(collar);

    const lapelGold = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.014), goldMat);
    lapelGold.position.set(0.068, 0.03, 0.125);
    torsoGroup.add(lapelGold);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.056, 0.11, 24), obsidianMat);
    neck.position.set(0, 0.135, -0.005);
    torsoGroup.add(neck);
    group.add(torsoGroup);

    // Head assembly
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.035, 0);

    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.115, 36, 28), obsidianMat);
    cranium.scale.set(0.88, 1.08, 0.96);
    headGroup.add(cranium);

    const facePlate = new THREE.Mesh(
      new THREE.SphereGeometry(0.106, 32, 24, -Math.PI * 0.36, Math.PI * 0.72, Math.PI * 0.16, Math.PI * 0.68),
      visorMat
    );
    facePlate.rotation.y = Math.PI * 0.5;
    facePlate.scale.set(0.95, 1.04, 0.9);
    facePlate.position.set(0, -0.004, 0.016);
    headGroup.add(facePlate);

    // Headset ear pods
    const earGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.016, 20);
    const leftEar = new THREE.Mesh(earGeo, trimMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.105, 0.005, 0);
    const rightEar = new THREE.Mesh(earGeo, trimMat);
    rightEar.rotation.z = Math.PI / 2;
    rightEar.position.set(0.105, 0.005, 0);
    headGroup.add(leftEar, rightEar);

    // Expressive eyes + brows
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x7ae2ff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const leftEyeGroup = new THREE.Group();
    leftEyeGroup.position.set(-0.038, 0.022, 0.095);
    const rightEyeGroup = new THREE.Group();
    rightEyeGroup.position.set(0.038, 0.022, 0.095);

    const eyeGeo = new THREE.SphereGeometry(0.013, 18, 14);
    const pupilGeo = new THREE.SphereGeometry(0.005, 12, 10);

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.scale.set(1.15, 0.95, 0.45);
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.z = 0.005;
    leftEyeGroup.add(leftEye, leftPupil);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.scale.set(1.15, 0.95, 0.45);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.z = 0.005;
    rightEyeGroup.add(rightEye, rightPupil);
    headGroup.add(leftEyeGroup, rightEyeGroup);

    const browMat = new THREE.MeshBasicMaterial({ color: 0x58c4dd });
    const browGeo = new THREE.BoxGeometry(0.028, 0.0045, 0.004);
    const leftBrow = new THREE.Mesh(browGeo, browMat);
    leftBrow.position.set(-0.038, 0.044, 0.096);
    const rightBrow = new THREE.Mesh(browGeo, browMat);
    rightBrow.position.set(0.038, 0.044, 0.096);
    headGroup.add(leftBrow, rightBrow);

    // Audio-reactive lip / spectrum mouth
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.042, 0.096);
    const mouthCoreMat = new THREE.MeshBasicMaterial({ color: 0x58c4dd });
    const mouthCore = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.028, 6, 12), mouthCoreMat);
    mouthCore.rotation.z = Math.PI / 2;
    mouthGroup.add(mouthCore);

    const spectrumBars = [];
    const barCount = 7;
    for (let i = 0; i < barCount; i += 1) {
      const barMat = new THREE.MeshBasicMaterial({
        color: i === 3 ? 0xf7c948 : 0x58c4dd,
        transparent: true,
        opacity: 0.9
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.006, 0.004), barMat);
      bar.position.set((i - 3) * 0.0085, 0, 0.003);
      mouthGroup.add(bar);
      spectrumBars.push(bar);
    }
    headGroup.add(mouthGroup);

    group.add(headGroup);

    procRig = {
      group,
      torsoGroup,
      headGroup,
      leftEyeGroup,
      rightEyeGroup,
      leftBrow,
      rightBrow,
      mouthGroup,
      mouthCore,
      mouthCoreMat,
      spectrumBars
    };

    return group;
  }

  function buildFallback2DStage() {
    if (!mountEl) return;
    mountEl.innerHTML = '';
    const box = document.createElement('div');
    box.style.cssText =
      'width:100%;height:100%;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%, #162442 0%, #090d16 78%);border-radius:14px;position:relative;overflow:hidden;padding:16px;box-sizing:border-box;';

    const ring = document.createElement('div');
    ring.style.cssText =
      'width:124px;height:124px;border-radius:999px;border:2px solid rgba(88,196,221,0.65);box-shadow:0 0 28px rgba(88,196,221,0.28),inset 0 0 22px rgba(88,196,221,0.16);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(12,18,32,0.88);transition:transform 80ms linear;';

    const eyesRow = document.createElement('div');
    eyesRow.style.cssText = 'display:flex;gap:24px;';
    for (let i = 0; i < 2; i += 1) {
      const eye = document.createElement('span');
      eye.style.cssText =
        'width:12px;height:12px;border-radius:999px;background:#7ae2ff;box-shadow:0 0 12px #58c4dd;display:block;';
      eyesRow.appendChild(eye);
    }

    const mouthRow = document.createElement('div');
    mouthRow.style.cssText = 'display:flex;align-items:center;gap:4px;height:22px;';
    fallback2dBars = [];
    for (let i = 0; i < 7; i += 1) {
      const bar = document.createElement('span');
      bar.style.cssText =
        'width:4px;height:4px;border-radius:4px;background:#58c4dd;transition:height 50ms linear;';
      mouthRow.appendChild(bar);
      fallback2dBars.push(bar);
    }

    ring.appendChild(eyesRow);
    ring.appendChild(mouthRow);
    box.appendChild(ring);

    const caption = document.createElement('div');
    caption.textContent = 'Instructor IA · Modo 2D Activo';
    caption.style.cssText =
      'margin-top:12px;font-size:12px;letter-spacing:0.04em;color:#9bb3d4;font-family:system-ui,sans-serif;';
    box.appendChild(caption);

    mountEl.appendChild(box);
    fallback2dRing = ring;
    fallback2dMouth = mouthRow;
  }

  function initThreeStage() {
    if (stageInitialized || !mountEl) return;
    stageInitialized = true;

    const width = Math.max(mountEl.clientWidth || 320, 220);
    const height = Math.max(mountEl.clientHeight || 260, 200);

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      mountEl.innerHTML = '';
      mountEl.appendChild(renderer.domElement);
      webglAvailable = true;
    } catch {
      webglAvailable = false;
      avatarMode = 'fallback-2d';
      buildFallback2DStage();
      emitAvatarStatus({ mode: 'fallback-2d', ready: true, message: 'Modo visual 2D activo' });
      startRenderLoop();
      return;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(31, width / height, 0.05, 30);
    // 0.65m head-and-shoulders framing
    camera.position.set(0, 1.53, 0.65);
    camera.lookAt(0, 1.49, 0);

    // 3-point studio lighting
    const hemi = new THREE.HemisphereLight(0xcbe8ff, 0x0b1220, 0.85);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e4, 2.15);
    keyLight.position.set(0.85, 2.25, 1.35);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6bd5f2, 0.95);
    fillLight.position.set(-1.1, 1.75, 0.8);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xf7c948, 1.35);
    rimLight.position.set(0.2, 2.1, -1.25);
    scene.add(rimLight);

    rimPointLight = new THREE.PointLight(0x58c4dd, 1.1, 3.0);
    rimPointLight.position.set(0, 1.56, -0.45);
    scene.add(rimPointLight);

    // Subtle 3B1B studio grid + glowing halo backdrop
    const polarGrid = new THREE.PolarGridHelper(0.75, 12, 6, 48, 0x1e3558, 0x13223b);
    polarGrid.position.set(0, 1.18, -0.04);
    scene.add(polarGrid);

    haloMat = new THREE.MeshBasicMaterial({
      color: 0x58c4dd,
      transparent: true,
      opacity: 0.42
    });
    haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.0038, 12, 64), haloMat);
    haloRing.position.set(0, 1.51, -0.18);
    scene.add(haloRing);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.31, 0.0022, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.18 })
    );
    outerRing.position.set(0, 1.51, -0.22);
    scene.add(outerRing);

    // Immediate procedural 3D instructor bust
    proceduralGroup = buildProceduralInstructorBust();
    scene.add(proceduralGroup);
    avatarMode = 'procedural';
    emitAvatarStatus({ mode: 'procedural', ready: true, message: 'Instructor 3D listo' });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (!renderer || !camera || !mountEl) return;
        const w = Math.max(mountEl.clientWidth || 320, 200);
        const h = Math.max(mountEl.clientHeight || 260, 180);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      resizeObserver.observe(mountEl);
    }

    startRenderLoop();
  }

  function resetGlbState() {
    if (glbGroup && scene) {
      scene.remove(glbGroup);
    }
    glbGroup = null;
    glbMorphMeshes = [];
    glbHeadBone = null;
    glbNeckBone = null;
    glbSpineBone = null;
    glbBaseRot = { head: null, neck: null, spine: null };
  }

  async function loadAvatarUrl(url) {
    initThreeStage();
    const target = String(url || '').trim();
    currentAvatarUrl = target || 'procedural';

    if (!webglAvailable || !scene) {
      avatarMode = 'fallback-2d';
      emitAvatarStatus({ mode: 'fallback-2d', ready: true, url: currentAvatarUrl });
      return { ok: true, mode: 'fallback-2d' };
    }

    if (!target || target === 'procedural') {
      glbLoadSeq += 1;
      resetGlbState();
      if (proceduralGroup) proceduralGroup.visible = true;
      avatarMode = 'procedural';
      camera.position.set(0, 1.53, 0.65);
      camera.lookAt(0, 1.49, 0);
      emitAvatarStatus({ mode: 'procedural', ready: true, url: 'procedural' });
      return { ok: true, mode: 'procedural' };
    }

    const loadId = ++glbLoadSeq;
    emitAvatarStatus({ mode: 'loading', url: target, message: 'Cargando avatar GLB...' });

    if (!gltfLoader) {
      gltfLoader = new GLTFLoader();
      if (typeof gltfLoader.setCrossOrigin === 'function') {
        gltfLoader.setCrossOrigin('anonymous');
      }
    }

    try {
      const gltf = await gltfLoader.loadAsync(target);
      if (destroyed || loadId !== glbLoadSeq) {
        return { ok: false, cancelled: true };
      }

      const root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
      if (!root) {
        throw new Error('GLB scene is empty');
      }

      resetGlbState();
      root.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      if (size.y > 0.01 && (size.y < 0.8 || size.y > 2.5)) {
        const scaleFactor = size.y < 0.8 ? 0.55 / size.y : 1.7 / size.y;
        root.scale.multiplyScalar(scaleFactor);
        root.updateMatrixWorld(true);
      }

      const scaledBox = new THREE.Box3().setFromObject(root);
      const scaledCenter = new THREE.Vector3();
      const scaledSize = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      scaledBox.getSize(scaledSize);

      const headY = scaledBox.max.y - Math.min(0.16, scaledSize.y * 0.11);
      root.position.x -= scaledCenter.x;
      root.position.z -= scaledCenter.z;
      root.position.y += 1.5 - headY;
      root.updateMatrixWorld(true);

      const morphMeshes = [];
      let totalMorphKeys = 0;

      root.traverse((obj) => {
        if (obj.isMesh) {
          obj.frustumCulled = false;
          if (obj.morphTargetDictionary && obj.morphTargetInfluences) {
            morphMeshes.push(obj);
            totalMorphKeys += Object.keys(obj.morphTargetDictionary).length;
          }
        }
        if (obj.isBone || obj.type === 'Bone' || obj.name) {
          const lower = String(obj.name || '').toLowerCase();
          if (!glbHeadBone && (lower === 'head' || lower.endsWith('head'))) {
            glbHeadBone = obj;
            glbBaseRot.head = obj.rotation.clone();
          } else if (!glbNeckBone && (lower === 'neck' || lower.endsWith('neck'))) {
            glbNeckBone = obj;
            glbBaseRot.neck = obj.rotation.clone();
          } else if (!glbSpineBone && (lower === 'spine2' || lower === 'spine1' || lower === 'spine')) {
            glbSpineBone = obj;
            glbBaseRot.spine = obj.rotation.clone();
          }
        }
      });

      if (glbHeadBone) {
        const headWorld = new THREE.Vector3();
        glbHeadBone.getWorldPosition(headWorld);
        root.position.y += 1.5 - headWorld.y;
        root.position.x -= headWorld.x;
        root.updateMatrixWorld(true);
      }

      glbGroup = root;
      glbMorphMeshes = morphMeshes;
      scene.add(glbGroup);
      if (proceduralGroup) proceduralGroup.visible = false;

      camera.position.set(0, 1.52, 0.65);
      camera.lookAt(0, 1.49, 0);

      avatarMode = 'glb';
      emitAvatarStatus({
        mode: 'glb',
        ready: true,
        url: target,
        morphCount: totalMorphKeys,
        message: 'Avatar 3D TalkingHead listo'
      });

      return { ok: true, mode: 'glb', morphCount: totalMorphKeys };
    } catch (err) {
      if (destroyed || loadId !== glbLoadSeq) {
        return { ok: false, cancelled: true };
      }
      resetGlbState();
      if (proceduralGroup) proceduralGroup.visible = true;
      avatarMode = 'procedural';
      emitAvatarStatus({
        mode: 'procedural',
        ready: true,
        fallback: true,
        url: target,
        error: err && err.message ? err.message : 'No se pudo cargar el GLB; usando busto 3D'
      });
      return {
        ok: false,
        mode: 'procedural',
        fallback: true,
        error: err && err.message ? err.message : 'GLB load failed'
      };
    }
  }

  function computeCurrentSpeechRms() {
    if (!speaking || paused) return 0;

    if (activeSpeechEngine === 'kokoro' && analyser && analyserData) {
      analyser.getByteTimeDomainData(analyserData);
      let sumSq = 0;
      for (let i = 0; i < analyserData.length; i += 1) {
        const norm = (analyserData[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / analyserData.length);
      return clamp01(rms * 3.8);
    }

    return 0;
  }

  function setMorphTarget(mesh, name, weight) {
    const dict = mesh.morphTargetDictionary;
    const infl = mesh.morphTargetInfluences;
    if (!dict || !infl) return;
    const idx = dict[name];
    if (typeof idx === 'number' && idx >= 0 && idx < infl.length) {
      infl[idx] = clamp01(weight);
    }
  }

  function updateFacialAnimation(nowMs, dtSec) {
    const moodCfg = MOOD_PRESETS[currentMood] || MOOD_PRESETS.neutral;
    const tSec = nowMs / 1000;
    const smooth = Math.min(1, dtSec * 16);

    // Blink scheduler
    if (nowMs >= animState.nextBlinkAt) {
      animState.blinkStartAt = nowMs;
      animState.nextBlinkAt = nowMs + 2700 + Math.random() * 2700;
    }
    let targetBlink = 0;
    if (animState.blinkStartAt >= 0) {
      const blinkAge = nowMs - animState.blinkStartAt;
      if (blinkAge < 165) {
        targetBlink = Math.sin((blinkAge / 165) * Math.PI);
      } else {
        animState.blinkStartAt = -1;
      }
    }
    animState.blink = lerp(animState.blink, targetBlink, Math.min(1, dtSec * 28));

    // Audio RMS + viseme sample
    const rawRms = computeCurrentSpeechRms();
    animState.rms = lerp(animState.rms, rawRms, smooth);

    let activeViseme = 'viseme_sil';
    let visemeOpen = 0;
    if (speaking && !paused) {
      const elapsedSec = Math.max(0, (nowMs - speechStartedMs - speechPausedAccumMs) / 1000);
      const sample = sampleVisemeTimeline(speechTimeline, elapsedSec);
      activeViseme = sample.viseme;
      visemeOpen = sample.open;
    }

    const targetJaw = speaking && !paused
      ? clamp01(animState.rms * 0.72 + visemeOpen * 0.36)
      : 0;
    animState.jawOpen = lerp(animState.jawOpen, targetJaw, smooth);

    for (const vKey of VISEME_MORPH_KEYS) {
      const targetVal = speaking && !paused && vKey === activeViseme
        ? clamp01(0.35 + animState.rms * 0.65)
        : (vKey === 'viseme_sil' && (!speaking || paused) ? 0.5 : 0);
      animState.visemes[vKey] = lerp(animState.visemes[vKey], targetVal, smooth);
    }

    const speakingEnergy = speaking && !paused ? 0.35 + animState.rms * 0.8 : 0.15;
    const targetSmile = moodCfg.smile + (speaking ? 0.05 : 0);
    const targetBrow = moodCfg.browUp + (speaking && !paused ? animState.rms * 0.22 : 0);
    animState.smile = lerp(animState.smile, targetSmile, Math.min(1, dtSec * 6));
    animState.browUp = lerp(animState.browUp, targetBrow, Math.min(1, dtSec * 8));

    // Breathing & mood head gestures
    const breath = Math.sin(tSec * 1.75) * 0.008;
    const targetHeadX = moodCfg.headPitchX + Math.sin(tSec * 2.4) * moodCfg.nodAmp * speakingEnergy + breath * 0.6;
    const targetHeadY = Math.sin(tSec * 0.85) * 0.055 * (speaking ? 1.25 : 0.65);
    const targetHeadZ = moodCfg.headTiltZ + Math.cos(tSec * 1.1) * 0.028;

    animState.headRotX = lerp(animState.headRotX, targetHeadX, Math.min(1, dtSec * 5));
    animState.headRotY = lerp(animState.headRotY, targetHeadY, Math.min(1, dtSec * 5));
    animState.headRotZ = lerp(animState.headRotZ, targetHeadZ, Math.min(1, dtSec * 5));

    // Update backdrop halo
    if (haloMat && haloRing) {
      haloMat.color.lerp(new THREE.Color(moodCfg.haloHue), Math.min(1, dtSec * 4));
      haloMat.opacity = 0.28 + animState.rms * 0.52;
      const haloScale = 1 + animState.rms * 0.08 + Math.sin(tSec * 1.8) * 0.015;
      haloRing.scale.set(haloScale, haloScale, 1);
    }
    if (rimPointLight) {
      rimPointLight.intensity = 0.9 + animState.rms * 1.6;
    }

    // Apply to GLB TalkingHead avatar
    if (avatarMode === 'glb' && glbGroup) {
      for (const mesh of glbMorphMeshes) {
        setMorphTarget(mesh, 'jawOpen', animState.jawOpen * 0.85);
        setMorphTarget(mesh, 'mouthOpen', animState.jawOpen * 0.6);
        setMorphTarget(mesh, 'mouthSmileLeft', animState.smile);
        setMorphTarget(mesh, 'mouthSmileRight', animState.smile);
        setMorphTarget(mesh, 'eyeBlinkLeft', animState.blink);
        setMorphTarget(mesh, 'eyeBlinkRight', animState.blink);
        setMorphTarget(mesh, 'browInnerUp', animState.browUp);
        setMorphTarget(mesh, 'browOuterUpLeft', animState.browUp * 0.6);
        setMorphTarget(mesh, 'browOuterUpRight', animState.browUp * 0.6);

        for (const vKey of VISEME_MORPH_KEYS) {
          setMorphTarget(mesh, vKey, animState.visemes[vKey]);
        }
      }

      if (glbHeadBone && glbBaseRot.head) {
        glbHeadBone.rotation.x = glbBaseRot.head.x + animState.headRotX;
        glbHeadBone.rotation.y = glbBaseRot.head.y + animState.headRotY;
        glbHeadBone.rotation.z = glbBaseRot.head.z + animState.headRotZ;
      }
      if (glbNeckBone && glbBaseRot.neck) {
        glbNeckBone.rotation.x = glbBaseRot.neck.x + animState.headRotX * 0.35;
        glbNeckBone.rotation.y = glbBaseRot.neck.y + animState.headRotY * 0.35;
      }
      if (glbSpineBone && glbBaseRot.spine) {
        glbSpineBone.rotation.x = glbBaseRot.spine.x + breath * 1.4;
      }
    }

    // Apply to procedural 3D instructor bust
    if (procRig && proceduralGroup && proceduralGroup.visible) {
      procRig.headGroup.rotation.set(animState.headRotX, animState.headRotY, animState.headRotZ);
      procRig.headGroup.position.y = 0.035 + breath * 0.45;
      procRig.torsoGroup.position.y = -0.22 + breath * 0.35;

      const eyeScaleY = Math.max(0.08, 1 - animState.blink * 0.92);
      procRig.leftEyeGroup.scale.y = eyeScaleY;
      procRig.rightEyeGroup.scale.y = eyeScaleY;

      const browOffset = animState.browUp * 0.012;
      procRig.leftBrow.position.y = 0.044 + browOffset;
      procRig.rightBrow.position.y = 0.044 + browOffset;
      procRig.leftBrow.rotation.z = currentMood === 'curious' ? 0.14 : (currentMood === 'emphatic' ? -0.1 : 0);
      procRig.rightBrow.rotation.z = currentMood === 'curious' ? -0.05 : (currentMood === 'emphatic' ? 0.1 : 0);

      const jawStretch = 0.55 + animState.jawOpen * 2.1;
      procRig.mouthCore.scale.set(jawStretch, 0.85 + animState.smile * 0.5, 1);
      procRig.mouthCoreMat.color.setHex(speaking && !paused ? 0x7ae2ff : 0x58c4dd);

      for (let i = 0; i < procRig.spectrumBars.length; i += 1) {
        const bar = procRig.spectrumBars[i];
        const centerWeight = 1 - Math.abs(i - 3) * 0.18;
        const wave = speaking && !paused
          ? 0.4 + 0.6 * Math.abs(Math.sin(tSec * 14 + i * 0.85))
          : 0.15;
        const scaleY = 0.55 + animState.jawOpen * 3.8 * centerWeight * wave;
        bar.scale.y = scaleY;
      }
    }

    // Apply to 2D fallback if WebGL isn't active
    if (!webglAvailable && fallback2dMouth) {
      if (fallback2dRing) {
        const scale = 1 + animState.rms * 0.05;
        fallback2dRing.style.transform = `scale(${scale.toFixed(3)})`;
      }
      for (let i = 0; i < fallback2dBars.length; i += 1) {
        const bar = fallback2dBars[i];
        const centerWeight = 1 - Math.abs(i - 3) * 0.16;
        const wave = speaking && !paused ? 0.4 + 0.6 * Math.abs(Math.sin(tSec * 14 + i)) : 0.2;
        const px = Math.round(4 + animState.jawOpen * 16 * centerWeight * wave);
        bar.style.height = `${px}px`;
      }
    }
  }

  function startRenderLoop() {
    if (rafId !== null || destroyed) return;
    let lastTime = performance.now();

    const tick = (now) => {
      if (destroyed) return;
      const dtSec = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      updateFacialAnimation(now, dtSec);
      if (webglAvailable && renderer && scene && camera) {
        renderer.render(scene, camera);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function clearSpeechResources() {
    if (activeBufferSource) {
      try {
        activeBufferSource.onended = null;
        activeBufferSource.stop();
        activeBufferSource.disconnect();
      } catch {
        // already stopped
      }
      activeBufferSource = null;
    }
  }

  function finishSpeech(reason = 'ended') {
    const wasSpeaking = speaking;
    clearSpeechResources();
    speaking = false;
    paused = false;
    activeSpeechEngine = null;
    speechPauseStartedMs = 0;
    speechPausedAccumMs = 0;

    if (speechEndResolver) {
      const resolve = speechEndResolver;
      speechEndResolver = null;
      resolve({ ok: true, reason });
    }

    if (wasSpeaking && typeof onSpeechEnd === 'function') {
      onSpeechEnd({ reason });
    }
    emitVoiceStatus({
      message: reason === 'stopped'
        ? 'Detenido'
        : `Kokoro-82M Español listo (${(kokoroDevice || 'wasm').toUpperCase()})`
    });
  }

  async function playKokoroBuffer(float32Array, samplingRate, text, token) {
    if (destroyed || token !== speechToken) return { ok: false, cancelled: true };

    const ctx = ensureAudioContext();
    if (!ctx) {
      throw new Error('AudioContext no disponible');
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (destroyed || token !== speechToken) return { ok: false, cancelled: true };

    const audioBuffer = ctx.createBuffer(1, float32Array.length, samplingRate);
    audioBuffer.copyToChannel(float32Array, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);

    activeBufferSource = source;
    activeSpeechEngine = 'kokoro';
    speaking = true;
    paused = false;
    const durationSec = audioBuffer.duration;
    speechTimeline = buildSpanishVisemeTimeline(text, durationSec);
    speechStartedMs = performance.now();
    speechPausedAccumMs = 0;

    if (typeof onSpeechStart === 'function') {
      onSpeechStart({ engine: 'kokoro', durationSec, text });
    }
    emitVoiceStatus({ message: `Narrando con Kokoro-82M Español (${currentVoiceId})` });

    return new Promise((resolve) => {
      speechEndResolver = resolve;
      source.onended = () => {
        if (token === speechToken && activeBufferSource === source) {
          finishSpeech('ended');
        } else {
          resolve({ ok: false, cancelled: true });
        }
      };
      source.start(0);
    });
  }

  async function init(options = {}) {
    initThreeStage();
    const { preloadKokoro = true, avatarUrl = currentAvatarUrl } = options;

    if (preloadKokoro) {
      ensureKokoroReady().catch(() => {});
    }

    if (avatarUrl && avatarUrl !== 'procedural') {
      loadAvatarUrl(avatarUrl);
    }

    return {
      ok: true,
      webgl: webglAvailable,
      kokoroState,
      avatarMode
    };
  }

  function setVoice(voiceId) {
    const profile = getVoiceProfile(voiceId);
    currentVoiceId = profile.id;
    emitVoiceStatus({ message: `Voz seleccionada: ${profile.label}` });
    return currentVoiceId;
  }

  function setMood(mood) {
    const normalized = String(mood || 'neutral').toLowerCase();
    currentMood = MOOD_PRESETS[normalized] ? normalized : 'neutral';
    return currentMood;
  }

  async function prefetch(text, options = {}) {
    if (destroyed || kokoroState !== 'ready') return null;
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;

    const voiceId = options.voice ? getVoiceProfile(options.voice).id : currentVoiceId;
    const speed = Number.isFinite(Number(options.speed)) ? Number(options.speed) : 1;

    try {
      return await getOrSynthesizeKokoroAudio(cleanText, voiceId, speed);
    } catch {
      return null;
    }
  }

  async function speak(text, hooks = {}) {
    initThreeStage();
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return { ok: true, empty: true };
    }

    if (hooks.voice) setVoice(hooks.voice);
    if (hooks.mood) setMood(hooks.mood);

    stop({ silent: true });
    const token = ++speechToken;
    const speed = Number.isFinite(Number(hooks.speed)) ? Number(hooks.speed) : 1;

    // Unlock AudioContext synchronously during user gesture before async awaits
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    try {
      if (kokoroState !== 'ready') {
        emitVoiceStatus({ message: 'Cargando Kokoro-82M Español (es-419)...' });
        await ensureKokoroReady();
      }
      if (destroyed || token !== speechToken) {
        return { ok: false, cancelled: true };
      }

      emitVoiceStatus({ message: `Sintetizando voz Kokoro-82M Español (${currentVoiceId})...` });
      const result = await getOrSynthesizeKokoroAudio(cleanText, currentVoiceId, speed);
      if (destroyed || token !== speechToken) {
        return { ok: false, cancelled: true };
      }

      if (!result || !result.float32Array || result.float32Array.length === 0) {
        throw new Error('Kokoro-82M Español devolvió audio vacío');
      }

      lastAudio = {
        float32Array: result.float32Array,
        samplingRate: result.samplingRate || 24000,
        text: cleanText,
        voice: currentVoiceId
      };

      if (typeof hooks.onStart === 'function') {
        hooks.onStart({ engine: 'kokoro' });
      }

      const playRes = await playKokoroBuffer(
        result.float32Array,
        result.samplingRate || 24000,
        cleanText,
        token
      );
      if (typeof hooks.onEnd === 'function') {
        hooks.onEnd(playRes);
      }
      return playRes;
    } catch (err) {
      if (destroyed || token !== speechToken) {
        return { ok: false, cancelled: true };
      }
      const message = err && err.message ? err.message : 'Error al sintetizar con Kokoro-82M Español';
      kokoroState = 'error';
      emitVoiceStatus({ state: 'error', message });
      return { ok: false, error: message };
    }
  }

  function stop(options = {}) {
    speechToken += 1;
    const silent = Boolean(options && options.silent);
    if (!speaking && !paused) {
      clearSpeechResources();
      return;
    }
    if (silent) {
      clearSpeechResources();
      speaking = false;
      paused = false;
      activeSpeechEngine = null;
      if (speechEndResolver) {
        const resolve = speechEndResolver;
        speechEndResolver = null;
        resolve({ ok: false, cancelled: true });
      }
      return;
    }
    finishSpeech('stopped');
  }

  function pause() {
    if (!speaking || paused) return false;
    paused = true;
    speechPauseStartedMs = performance.now();

    if (activeSpeechEngine === 'kokoro' && audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend().catch(() => {});
    }

    emitVoiceStatus({ message: 'Narración en pausa' });
    return true;
  }

  function resume() {
    if (!speaking || !paused) return false;
    paused = false;
    if (speechPauseStartedMs > 0) {
      speechPausedAccumMs += performance.now() - speechPauseStartedMs;
      speechPauseStartedMs = 0;
    }

    if (activeSpeechEngine === 'kokoro' && audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    emitVoiceStatus({ message: `Narrando con Kokoro-82M Español (${currentVoiceId})` });
    return true;
  }

  function downloadLastWav(filename = 'leccion-ucg.wav') {
    if (!lastAudio || !lastAudio.float32Array || !lastAudio.float32Array.length) {
      emitVoiceStatus({ message: 'Genera primero un audio con Kokoro-82M para descargar el WAV' });
      return null;
    }

    const safeName = String(filename || 'leccion-ucg.wav').endsWith('.wav')
      ? String(filename || 'leccion-ucg.wav')
      : `${filename}.wav`;
    const blob = encodeWavBlob(lastAudio.float32Array, lastAudio.samplingRate);

    if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }

    return {
      ok: true,
      filename: safeName,
      blob,
      samplingRate: lastAudio.samplingRate,
      durationSec: lastAudio.float32Array.length / lastAudio.samplingRate
    };
  }

  function getState() {
    return {
      kokoroState,
      kokoroDevice,
      voiceId: currentVoiceId,
      mood: currentMood,
      speaking,
      paused,
      avatarMode,
      avatarUrl: currentAvatarUrl,
      webgl: webglAvailable,
      hasLastAudio: Boolean(lastAudio && lastAudio.float32Array && lastAudio.float32Array.length),
      lastAudioDurationSec: lastAudio
        ? lastAudio.float32Array.length / (lastAudio.samplingRate || 24000)
        : 0
    };
  }

  function destroy() {
    destroyed = true;
    stop({ silent: true });

    if (rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (worker) {
      worker.terminate();
      worker = null;
    }
    for (const [, pending] of pendingSpeakRequests.entries()) {
      pending.reject(new Error('Controller destroyed'));
    }
    pendingSpeakRequests.clear();
    inflightSynthRequests.clear();
    synthesisCache.clear();
    settleWorkerInitFailure('Controller destroyed');

    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }

    if (scene) {
      scene.traverse((obj) => {
        if (obj.geometry && typeof obj.geometry.dispose === 'function') {
          obj.geometry.dispose();
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (mat && typeof mat.dispose === 'function') mat.dispose();
          }
        }
      });
    }
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
  }

  // Render procedural bust immediately on controller creation so mountEl is never empty
  initThreeStage();

  return {
    init,
    setVoice,
    setMood,
    loadAvatarUrl,
    prefetch,
    speak,
    stop,
    pause,
    resume,
    downloadLastWav,
    getState,
    destroy
  };
}
