import { classifyAudioChannels, type AudioClassificationResult } from './audioClassifier';

export interface DecodedVocalData {
  duration: number;
  sampleRate: number;
  peaksPerSecond: number;
  /** Interleaved [min, max] pairs at peaksPerSecond resolution */
  peaks: Float32Array;
  rmsHz: number;
  /** Short-time RMS energy values at rmsHz (50 Hz = 20ms frames) */
  rmsEnvelope: Float32Array;
  /** Auto-detected classification: full_mix vs isolated_vocal */
  classification: AudioClassificationResult;
}

export type AudioMixMode = 'vocal' | 'instrumental' | 'mix';

type TimeListener = (currentTimeSec: number, isPlaying: boolean) => void;

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

class KaraokeAudioEngine {
  private ctx: AudioContext | null = null;
  private mixBus: GainNode | null = null;
  private masterLimiter: DynamicsCompressorNode | null = null;
  private limiterEngaged = false;

  private vocalBuffer: AudioBuffer | null = null;
  private instrumentalBuffer: AudioBuffer | null = null;
  private backingVocalBuffer: AudioBuffer | null = null;
  private vocalSource: AudioBufferSourceNode | null = null;
  private instrumentalSource: AudioBufferSourceNode | null = null;
  private backingVocalSource: AudioBufferSourceNode | null = null;
  private vocalGain: GainNode | null = null;
  private instrumentalGain: GainNode | null = null;
  private backingVocalGain: GainNode | null = null;

  private mixMode: AudioMixMode = 'vocal';
  private playbackRate = 1.0;
  private instrumentalGainDb = 0;
  private backingVocalGainDb = 0;
  private rafId: number | null = null;
  private listeners = new Set<TimeListener>();
  private hasInstrumental = false;
  private hasBackingVocal = false;

  private playing = false;
  private anchorOffsetSec = 0;
  private anchorCtxTime = 0;
  private durationSec = 0;
  private instLoadToken = 0;
  private backingLoadToken = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (!this.mixBus) {
      this.mixBus = this.ctx.createGain();
      this.masterLimiter = this.ctx.createDynamicsCompressor();
      this.masterLimiter.threshold.value = -1.0;
      this.masterLimiter.knee.value = 3.0;
      this.masterLimiter.ratio.value = 20.0;
      this.masterLimiter.attack.value = 0.003;
      this.masterLimiter.release.value = 0.08;
      this.masterLimiter.connect(this.ctx.destination);
      this.mixBus.connect(this.ctx.destination);
      this.limiterEngaged = false;
      this.updateLimiterRouting();
    }
    return this.ctx;
  }

  private shouldEngageLimiter(): boolean {
    if (this.mixMode === 'vocal' || !this.hasInstrumental) return false;
    return (
      this.instrumentalGainDb >= 3.0 ||
      (this.hasBackingVocal && this.backingVocalGainDb >= 3.0)
    );
  }

  private updateLimiterRouting() {
    if (!this.ctx || !this.mixBus || !this.masterLimiter) return;
    const wantLimiter = this.shouldEngageLimiter();
    if (wantLimiter === this.limiterEngaged) return;
    try {
      this.mixBus.disconnect();
    } catch {
      // Ignore if not connected
    }
    if (wantLimiter) {
      this.mixBus.connect(this.masterLimiter);
    } else {
      this.mixBus.connect(this.ctx.destination);
    }
    this.limiterEngaged = wantLimiter;
  }

  subscribe(listener: TimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const t = this.getCurrentTime();
    for (const listener of this.listeners) {
      listener(t, this.playing);
    }
  }

  private startSyncLoop() {
    this.stopSyncLoop();
    const tick = () => {
      const cur = this.getCurrentTime();
      if (this.durationSec > 0 && cur >= this.durationSec) {
        this.pause();
        this.anchorOffsetSec = this.durationSec;
        this.emit();
        return;
      }
      this.emit();
      if (this.playing) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopSyncLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private stopSources() {
    if (this.vocalSource) {
      try {
        this.vocalSource.onended = null;
        this.vocalSource.stop();
        this.vocalSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.vocalSource = null;
    }
    if (this.instrumentalSource) {
      try {
        this.instrumentalSource.onended = null;
        this.instrumentalSource.stop();
        this.instrumentalSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.instrumentalSource = null;
    }
    if (this.backingVocalSource) {
      try {
        this.backingVocalSource.onended = null;
        this.backingVocalSource.stop();
        this.backingVocalSource.disconnect();
      } catch {
        // Ignore already stopped
      }
      this.backingVocalSource = null;
    }
  }

  async loadVocalFile(file: File): Promise<DecodedVocalData> {
    this.pause();
    this.anchorOffsetSec = 0;

    const arrayBuffer = await file.arrayBuffer();
    const ctx = this.ensureContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.vocalBuffer = audioBuffer;
    this.durationSec = audioBuffer.duration;
    this.emit();
    return this.extractWaveformAndEnvelope(audioBuffer, file.name);
  }

  loadInstrumentalFile(file: File | null) {
    const wasPlaying = this.playing;
    const currentT = this.getCurrentTime();
    this.pause();
    this.instLoadToken++;
    const token = this.instLoadToken;

    if (!file) {
      this.hasInstrumental = false;
      this.instrumentalBuffer = null;
      if (this.mixMode !== 'vocal') {
        this.mixMode = 'vocal';
      }
      this.applyVolumes();
      this.emit();
      return;
    }

    this.hasInstrumental = true;
    const ctx = this.ensureContext();
    void file
      .arrayBuffer()
      .then((buf) => ctx.decodeAudioData(buf.slice(0)))
      .then((decoded) => {
        if (token !== this.instLoadToken) return;
        this.instrumentalBuffer = decoded;
        if (!this.durationSec) {
          this.durationSec = decoded.duration;
        }
        this.applyVolumes();
        if (wasPlaying) {
          this.anchorOffsetSec = currentT;
          void this.play();
        }
      })
      .catch(() => {
        if (token !== this.instLoadToken) return;
        this.hasInstrumental = false;
        this.instrumentalBuffer = null;
      });
  }

  loadBackingVocalFile(file: File | null) {
    const wasPlaying = this.playing;
    const currentT = this.getCurrentTime();
    this.pause();
    this.backingLoadToken++;
    const token = this.backingLoadToken;

    if (!file) {
      this.hasBackingVocal = false;
      this.backingVocalBuffer = null;
      this.applyVolumes();
      this.emit();
      return;
    }

    this.hasBackingVocal = true;
    const ctx = this.ensureContext();
    void file
      .arrayBuffer()
      .then((buf) => ctx.decodeAudioData(buf.slice(0)))
      .then((decoded) => {
        if (token !== this.backingLoadToken) return;
        this.backingVocalBuffer = decoded;
        this.applyVolumes();
        if (wasPlaying) {
          this.anchorOffsetSec = currentT;
          void this.play();
        }
      })
      .catch(() => {
        if (token !== this.backingLoadToken) return;
        this.hasBackingVocal = false;
        this.backingVocalBuffer = null;
      });
  }

  reset() {
    this.pause();
    this.instLoadToken++;
    this.backingLoadToken++;
    this.vocalBuffer = null;
    this.instrumentalBuffer = null;
    this.backingVocalBuffer = null;
    this.hasInstrumental = false;
    this.hasBackingVocal = false;
    this.instrumentalGainDb = 0;
    this.backingVocalGainDb = 0;
    this.mixMode = 'vocal';
    this.playbackRate = 1.0;
    this.anchorOffsetSec = 0;
    this.durationSec = 0;
    this.updateLimiterRouting();
    this.emit();
  }

  private getGainTargets(): { vocal: number; instrumental: number; backingVocal: number } {
    if (!this.hasInstrumental || !this.instrumentalBuffer || this.mixMode === 'vocal') {
      return { vocal: 1.0, instrumental: 0.0, backingVocal: 0.0 };
    }
    const instLinear = dbToLinear(this.instrumentalGainDb);
    const backingLinear =
      this.hasBackingVocal && this.backingVocalBuffer
        ? dbToLinear(this.backingVocalGainDb)
        : 0.0;
    if (this.mixMode === 'instrumental') {
      return { vocal: 0.0, instrumental: instLinear, backingVocal: backingLinear };
    }
    // Guide mix: full instrumental + backing vocals + softer guide vocal
    return { vocal: 0.45, instrumental: instLinear, backingVocal: backingLinear };
  }

  private applyVolumes() {
    const { vocal, instrumental, backingVocal } = this.getGainTargets();
    if (this.vocalGain) {
      this.vocalGain.gain.value = vocal;
    }
    if (this.instrumentalGain) {
      this.instrumentalGain.gain.value = instrumental;
    }
    if (this.backingVocalGain) {
      this.backingVocalGain.gain.value = backingVocal;
    }
    this.updateLimiterRouting();
  }

  setInstrumentalGainDb(db: number) {
    this.instrumentalGainDb = Math.max(-6, Math.min(6, db));
    this.applyVolumes();
  }

  setBackingVocalGainDb(db: number) {
    this.backingVocalGainDb = Math.max(-12, Math.min(6, db));
    this.applyVolumes();
  }

  setMixMode(mode: AudioMixMode) {
    this.mixMode = this.hasInstrumental ? mode : 'vocal';
    this.applyVolumes();
  }

  getMixMode(): AudioMixMode {
    return this.mixMode;
  }

  setPlaybackRate(rate: number) {
    const clamped = Math.max(0.5, Math.min(1.5, rate));
    if (this.playing) {
      this.anchorOffsetSec = this.getCurrentTime();
      this.anchorCtxTime = this.ensureContext().currentTime;
    }
    this.playbackRate = clamped;
    if (this.vocalSource) {
      this.vocalSource.playbackRate.value = clamped;
    }
    if (this.instrumentalSource) {
      this.instrumentalSource.playbackRate.value = clamped;
    }
    if (this.backingVocalSource) {
      this.backingVocalSource.playbackRate.value = clamped;
    }
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(): number {
    if (!this.playing || !this.ctx) {
      return this.anchorOffsetSec;
    }
    const elapsed = (this.ctx.currentTime - this.anchorCtxTime) * this.playbackRate;
    const t = this.anchorOffsetSec + elapsed;
    return this.durationSec > 0 ? Math.min(this.durationSec, Math.max(0, t)) : Math.max(0, t);
  }

  async play() {
    if (!this.vocalBuffer && !this.instrumentalBuffer) return;
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    this.stopSources();

    if (this.durationSec > 0 && this.anchorOffsetSec >= this.durationSec - 0.02) {
      this.anchorOffsetSec = 0;
    }

    const offset = Math.max(0, this.anchorOffsetSec);
    const { vocal, instrumental, backingVocal } = this.getGainTargets();
    this.updateLimiterRouting();
    const destinationNode = this.mixBus || ctx.destination;
    const startWhen = ctx.currentTime + 0.005;

    if (this.vocalBuffer && offset < this.vocalBuffer.duration) {
      const vGain = ctx.createGain();
      vGain.gain.value = vocal;
      vGain.connect(destinationNode);
      this.vocalGain = vGain;

      const vSrc = ctx.createBufferSource();
      vSrc.buffer = this.vocalBuffer;
      vSrc.playbackRate.value = this.playbackRate;
      vSrc.connect(vGain);
      vSrc.start(startWhen, offset);
      this.vocalSource = vSrc;
    }

    if (this.instrumentalBuffer && offset < this.instrumentalBuffer.duration) {
      const iGain = ctx.createGain();
      iGain.gain.value = instrumental;
      iGain.connect(destinationNode);
      this.instrumentalGain = iGain;

      const iSrc = ctx.createBufferSource();
      iSrc.buffer = this.instrumentalBuffer;
      iSrc.playbackRate.value = this.playbackRate;
      iSrc.connect(iGain);
      iSrc.start(startWhen, offset);
      this.instrumentalSource = iSrc;
    }

    if (this.backingVocalBuffer && offset < this.backingVocalBuffer.duration) {
      const bGain = ctx.createGain();
      bGain.gain.value = backingVocal;
      bGain.connect(destinationNode);
      this.backingVocalGain = bGain;

      const bSrc = ctx.createBufferSource();
      bSrc.buffer = this.backingVocalBuffer;
      bSrc.playbackRate.value = this.playbackRate;
      bSrc.connect(bGain);
      bSrc.start(startWhen, offset);
      this.backingVocalSource = bSrc;
    }

    this.anchorCtxTime = startWhen;
    this.playing = true;
    this.startSyncLoop();
    this.emit();
  }

  pause() {
    if (this.playing) {
      this.anchorOffsetSec = this.getCurrentTime();
    }
    this.playing = false;
    this.stopSources();
    this.stopSyncLoop();
    this.emit();
  }

  async togglePlay() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      await this.play();
    }
  }

  seek(timeSec: number) {
    const duration = this.durationSec || 0;
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, timeSec) : timeSec);
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.stopSources();
      this.playing = false;
    }
    this.anchorOffsetSec = clamped;
    this.emit();
    if (wasPlaying) {
      void this.play();
    }
  }

  private extractWaveformAndEnvelope(buffer: AudioBuffer, fileName = ''): DecodedVocalData {
    const duration = buffer.duration;
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;

    const ch0 = buffer.getChannelData(0);
    const ch1 = numChannels > 1 ? buffer.getChannelData(1) : null;
    const classification = classifyAudioChannels(ch0, ch1, sampleRate, fileName);

    // 1. Extract high-resolution waveform min/max peaks (100 buckets/sec)
    const peaksPerSecond = 120;
    const totalPeakBuckets = Math.max(1, Math.ceil(duration * peaksPerSecond));
    const samplesPerBucket = length / totalPeakBuckets;
    const peaks = new Float32Array(totalPeakBuckets * 2);

    let maxAbsPeak = 0.001;
    for (let b = 0; b < totalPeakBuckets; b++) {
      const startIdx = Math.floor(b * samplesPerBucket);
      const endIdx = Math.min(length, Math.floor((b + 1) * samplesPerBucket));
      let minVal = 0;
      let maxVal = 0;
      // Stride slightly on huge buffers to keep decode < 50ms
      const step = Math.max(1, Math.floor((endIdx - startIdx) / 64));
      for (let i = startIdx; i < endIdx; i += step) {
        const s = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
        if (s < minVal) minVal = s;
        if (s > maxVal) maxVal = s;
      }
      peaks[b * 2] = minVal;
      peaks[b * 2 + 1] = maxVal;
      const localMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
      if (localMax > maxAbsPeak) maxAbsPeak = localMax;
    }

    // Normalize peaks nicely to [-1, 1] for crisp visual rendering even on quiet stems
    const normScale = maxAbsPeak > 0.01 ? 0.95 / maxAbsPeak : 1.0;
    for (let i = 0; i < peaks.length; i++) {
      peaks[i] = Math.max(-1, Math.min(1, peaks[i] * normScale));
    }

    // 2. Extract 50 Hz (20ms) RMS vocal energy envelope with mild first-difference vocal emphasis
    const rmsHz = 50;
    const totalRmsFrames = Math.max(1, Math.ceil(duration * rmsHz));
    const samplesPerFrame = length / totalRmsFrames;
    const rmsEnvelope = new Float32Array(totalRmsFrames);

    let maxRms = 0.0001;
    for (let f = 0; f < totalRmsFrames; f++) {
      const startIdx = Math.floor(f * samplesPerFrame);
      const endIdx = Math.min(length, Math.floor((f + 1) * samplesPerFrame));
      let sumSq = 0;
      let count = 0;
      const step = Math.max(1, Math.floor((endIdx - startIdx) / 128));
      for (let i = startIdx; i < endIdx; i += step) {
        const cur = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
        const prev = i > 0 ? (ch1 ? (ch0[i - 1] + ch1[i - 1]) * 0.5 : ch0[i - 1]) : cur;
        // Pre-emphasis suppresses sub-bass rumble and accentuates vocal formants/consonants
        const emphasized = cur - 0.85 * prev;
        const blended = 0.65 * cur + 0.35 * emphasized;
        sumSq += blended * blended;
        count++;
      }
      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      rmsEnvelope[f] = rms;
      if (rms > maxRms) maxRms = rms;
    }

    for (let f = 0; f < totalRmsFrames; f++) {
      rmsEnvelope[f] = rmsEnvelope[f] / maxRms;
    }

    return {
      duration,
      sampleRate,
      peaksPerSecond,
      peaks,
      rmsHz,
      rmsEnvelope,
      classification,
    };
  }
}

export const audioEngine = new KaraokeAudioEngine();

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read audio file'));
    reader.readAsDataURL(file);
  });
}

export function base64ToFile(base64: string, fileName: string, mimeType = 'audio/wav'): File {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}
