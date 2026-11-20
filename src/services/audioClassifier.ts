export type AudioSourceClassification = 'full_mix' | 'isolated_vocal';

export interface AudioClassificationMetrics {
  subBassRatio: number;
  silenceRatio: number;
  stereoWidth: number;
  isStereo: boolean;
  filenameHint: 'vocal' | 'none';
  score: number;
}

export interface AudioClassificationResult {
  classification: AudioSourceClassification;
  /** Confidence in [0.5, 0.99] */
  confidence: number;
  metrics: AudioClassificationMetrics;
}

/**
 * Checks whether a filename explicitly carries standard vocal-stem tags
 * (e.g. "(Vocals)", "_vocals", "vocal_stem", "acapella", "_lead").
 */
export function detectVocalFilenameHint(fileName: string): 'vocal' | 'none' {
  if (!fileName) return 'none';
  const lower = fileName.toLowerCase();
  // Strip extension
  const dot = lower.lastIndexOf('.');
  const stem = dot > 0 ? lower.slice(0, dot) : lower;

  // Exclude explicit backing/instrumental tags that should not be treated as lead vocal
  if (/(instrumental|backing|karaoke|no[\s_-]?vocals?)/i.test(stem)) {
    return 'none';
  }

  // Standard vocal stem markers from UVR5, VocalDrop, Demucs, KaraoCraft, Moises, etc.
  const vocalMarkerPatterns = [
    /[\(\[\s_-]vocals?[\)\]\s_-]?$/,
    /[\(\[]vocals?[\)\]]/,
    /\bvocal[\s_-]?stem\b/,
    /\bisolated[\s_-]?vocals?\b/,
    /\blead[\s_-]?vocals?\b/,
    /\ba[\s_-]?capp?ella\b/,
    /_vocals?(?:_lead)?$/,
    /-vocals?(?:-lead)?$/,
  ];

  for (const re of vocalMarkerPatterns) {
    if (re.test(stem)) {
      return 'vocal';
    }
  }
  return 'none';
}

/**
 * Pure DSP + filename classifier that distinguishes an already-isolated vocal stem
 * from a full mixed song in <50ms with zero external dependencies.
 */
export function classifyAudioChannels(
  ch0: Float32Array,
  ch1: Float32Array | null,
  sampleRate: number,
  fileName = ''
): AudioClassificationResult {
  const length = ch0.length;
  const sr = Math.max(8000, sampleRate || 44100);
  const filenameHint = detectVocalFilenameHint(fileName);

  if (length < sr * 0.25) {
    return {
      classification: filenameHint === 'vocal' ? 'isolated_vocal' : 'full_mix',
      confidence: 0.55,
      metrics: {
        subBassRatio: 0,
        silenceRatio: 0,
        stereoWidth: 0,
        isStereo: Boolean(ch1),
        filenameHint,
        score: filenameHint === 'vocal' ? 1.5 : 0,
      },
    };
  }

  // 1. Compute 100ms frame RMS across the entire track to measure quiet-frame ratio
  const frameSamples = Math.max(1, Math.floor(sr * 0.1));
  const numFrames = Math.max(1, Math.floor(length / frameSamples));
  const frameRms = new Float32Array(numFrames);
  const stride = Math.max(1, Math.floor(frameSamples / 256));

  for (let f = 0; f < numFrames; f++) {
    const start = f * frameSamples;
    const end = Math.min(length, start + frameSamples);
    let sumSq = 0;
    let count = 0;
    for (let i = start; i < end; i += stride) {
      const s = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
      sumSq += s * s;
      count++;
    }
    frameRms[f] = count > 0 ? Math.sqrt(sumSq / count) : 0;
  }

  const sortedRms = Array.from(frameRms).sort((a, b) => a - b);
  const p95 = sortedRms[Math.min(sortedRms.length - 1, Math.floor(sortedRms.length * 0.95))] || 0;
  const silenceThresh = Math.max(1e-5, p95 * 0.01); // ~ -40 dB below active vocal/mix level
  let silentFrames = 0;
  for (let f = 0; f < numFrames; f++) {
    if (frameRms[f] < silenceThresh) {
      silentFrames++;
    }
  }
  const silenceRatio = silentFrames / numFrames;

  // 2. Sample up to 24 evenly spaced 0.5s windows across active parts of the track
  //    to compute sub-bass energy ratio (< 110 Hz) and stereo Side/Mid width.
  const activeThresh = Math.max(1e-4, p95 * 0.12);
  const windowSamples = Math.min(length, Math.floor(sr * 0.5));
  const maxWindows = 24;
  const stepWindows = Math.max(1, Math.floor((length - windowSamples) / maxWindows));

  // Cascaded 2-pole one-pole low-pass filter at fc = 110 Hz
  const fc = 110;
  const rc = 1 / (2 * Math.PI * fc);
  const dt = 1 / sr;
  const alpha = dt / (rc + dt);

  let totalEnergy = 0;
  let subBassEnergy = 0;
  let midEnergy = 0;
  let sideEnergy = 0;
  let stereoDiffSamples = 0;

  let windowsChecked = 0;
  for (let pos = 0; pos + windowSamples <= length && windowsChecked < maxWindows * 2; pos += stepWindows) {
    const fIdx = Math.min(numFrames - 1, Math.floor(pos / frameSamples));
    if (frameRms[fIdx] < activeThresh) {
      continue;
    }
    windowsChecked++;

    let lp1 = 0;
    let lp2 = 0;
    const end = pos + windowSamples;
    for (let i = pos; i < end; i++) {
      const l = ch0[i];
      const r = ch1 ? ch1[i] : l;
      const mid = (l + r) * 0.5;
      const side = (l - r) * 0.5;

      // 2nd-order low-pass (~ -12 dB/oct above 110 Hz)
      lp1 += alpha * (mid - lp1);
      lp2 += alpha * (lp1 - lp2);

      totalEnergy += mid * mid;
      subBassEnergy += lp2 * lp2;
      midEnergy += mid * mid;
      sideEnergy += side * side;
      if (ch1 && Math.abs(l - r) > 1e-6) {
        stereoDiffSamples++;
      }
    }
    if (windowsChecked >= maxWindows) break;
  }

  const subBassRatio = totalEnergy > 1e-9 ? subBassEnergy / totalEnergy : 0;
  const isStereo = Boolean(ch1 && stereoDiffSamples > 16);
  const stereoWidth = isStereo && midEnergy > 1e-9 ? Math.sqrt(sideEnergy / midEnergy) : 0;

  // 3. Combine DSP & filename evidence into a vocal score (> 0 => isolated vocal, < 0 => full mix)
  let score = 0;

  // Sub-bass energy (<110 Hz): strong indicator of drums/bass in full songs
  if (subBassRatio >= 0.14) {
    score -= 2.2;
  } else if (subBassRatio >= 0.08) {
    score -= 1.2;
  } else if (subBassRatio <= 0.03) {
    score += 1.2;
  } else if (subBassRatio <= 0.055) {
    score += 0.4;
  }

  // Silence/pause ratio: isolated vocals drop to near-zero between phrases
  if (silenceRatio >= 0.25) {
    score += 2.0;
  } else if (silenceRatio >= 0.15) {
    score += 1.0;
  } else if (silenceRatio <= 0.04) {
    score -= 1.6;
  } else if (silenceRatio <= 0.09) {
    score -= 0.7;
  }

  // Stereo width: isolated lead vocals are typically mono/centered
  if (isStereo) {
    if (stereoWidth >= 0.28) {
      score -= 1.0;
    } else if (stereoWidth >= 0.18) {
      score -= 0.4;
    } else if (stereoWidth <= 0.08) {
      score += 0.7;
    }
  } else {
    // True mono files are mildly more likely to be vocal stems, though mono mixes exist
    score += 0.3;
  }

  // Soft filename hint tie-breaker (never overrides strong full-mix bass + continuous energy)
  if (filenameHint === 'vocal') {
    score += 1.5;
  }

  const classification: AudioSourceClassification = score >= 0.5 ? 'isolated_vocal' : 'full_mix';
  const margin = Math.abs(score - 0.5);
  const confidence = Math.min(0.99, Math.max(0.52, 0.55 + margin * 0.11));

  return {
    classification,
    confidence: Number(confidence.toFixed(2)),
    metrics: {
      subBassRatio: Number(subBassRatio.toFixed(4)),
      silenceRatio: Number(silenceRatio.toFixed(4)),
      stereoWidth: Number(stereoWidth.toFixed(4)),
      isStereo,
      filenameHint,
      score: Number(score.toFixed(2)),
    },
  };
}
