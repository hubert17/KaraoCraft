export interface DecodedVocalData {
  duration: number;
  sampleRate: number;
  peaksPerSecond: number;
  /** Interleaved [min, max] pairs at peaksPerSecond resolution */
  peaks: Float32Array;
  rmsHz: number;
  /** Short-time RMS energy values at rmsHz (50 Hz = 20ms frames) */
  rmsEnvelope: Float32Array;
}

export type AudioMixMode = 'vocal' | 'instrumental' | 'mix';

type TimeListener = (currentTimeSec: number, isPlaying: boolean) => void;

class KaraokeAudioEngine {
  private vocalAudio: HTMLAudioElement;
  private instrumentalAudio: HTMLAudioElement;
  private vocalUrl: string | null = null;
  private instrumentalUrl: string | null = null;
  private mixMode: AudioMixMode = 'vocal';
  private playbackRate = 1.0;
  private rafId: number | null = null;
  private listeners = new Set<TimeListener>();
  private hasInstrumental = false;

  constructor() {
    this.vocalAudio = new Audio();
    this.vocalAudio.preload = 'auto';

    this.instrumentalAudio = new Audio();
    this.instrumentalAudio.preload = 'auto';

    this.vocalAudio.addEventListener('ended', () => {
      this.pause();
      this.emit();
    });

    this.instrumentalAudio.addEventListener('ended', () => {
      if (this.mixMode === 'instrumental') {
        this.pause();
        this.emit();
      }
    });
  }

  subscribe(listener: TimeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const primary = this.getPrimaryElement();
    const playing = !primary.paused && !primary.ended;
    const t = primary.currentTime || 0;
    for (const listener of this.listeners) {
      listener(t, playing);
    }
  }

  private getPrimaryElement(): HTMLAudioElement {
    if (this.mixMode === 'instrumental' && this.hasInstrumental) {
      return this.instrumentalAudio;
    }
    return this.vocalAudio;
  }

  private startSyncLoop() {
    this.stopSyncLoop();
    const tick = () => {
      if (this.mixMode === 'mix' && this.hasInstrumental && !this.vocalAudio.paused) {
        const drift = Math.abs(this.instrumentalAudio.currentTime - this.vocalAudio.currentTime);
        if (drift > 0.04) {
          this.instrumentalAudio.currentTime = this.vocalAudio.currentTime;
        }
      }
      this.emit();
      const primary = this.getPrimaryElement();
      if (!primary.paused && !primary.ended) {
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

  async loadVocalFile(file: File): Promise<DecodedVocalData> {
    this.pause();
    if (this.vocalUrl) {
      URL.revokeObjectURL(this.vocalUrl);
    }
    this.vocalUrl = URL.createObjectURL(file);
    this.vocalAudio.src = this.vocalUrl;
    this.vocalAudio.playbackRate = this.playbackRate;
    this.vocalAudio.load();
    this.applyVolumes();

    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      return this.extractWaveformAndEnvelope(audioBuffer);
    } finally {
      await ctx.close().catch(() => undefined);
    }
  }

  loadInstrumentalFile(file: File | null) {
    const wasPlaying = this.isPlaying();
    const currentT = this.getCurrentTime();
    this.pause();

    if (this.instrumentalUrl) {
      URL.revokeObjectURL(this.instrumentalUrl);
      this.instrumentalUrl = null;
    }

    if (!file) {
      this.hasInstrumental = false;
      this.instrumentalAudio.removeAttribute('src');
      if (this.mixMode !== 'vocal') {
        this.mixMode = 'vocal';
      }
      this.applyVolumes();
      return;
    }

    this.instrumentalUrl = URL.createObjectURL(file);
    this.instrumentalAudio.src = this.instrumentalUrl;
    this.instrumentalAudio.playbackRate = this.playbackRate;
    this.instrumentalAudio.currentTime = currentT;
    this.instrumentalAudio.load();
    this.hasInstrumental = true;
    this.applyVolumes();

    if (wasPlaying) {
      void this.play();
    }
  }

  private applyVolumes() {
    if (!this.hasInstrumental || this.mixMode === 'vocal') {
      this.vocalAudio.muted = false;
      this.vocalAudio.volume = 1.0;
      this.instrumentalAudio.muted = true;
      this.instrumentalAudio.volume = 0.0;
    } else if (this.mixMode === 'instrumental') {
      this.vocalAudio.muted = true;
      this.vocalAudio.volume = 0.0;
      this.instrumentalAudio.muted = false;
      this.instrumentalAudio.volume = 1.0;
    } else {
      // Guide mix: full instrumental + softer guide vocal
      this.vocalAudio.muted = false;
      this.vocalAudio.volume = 0.45;
      this.instrumentalAudio.muted = false;
      this.instrumentalAudio.volume = 1.0;
    }
  }

  setMixMode(mode: AudioMixMode) {
    const currentT = this.getCurrentTime();
    const wasPlaying = this.isPlaying();
    this.pause();
    this.mixMode = this.hasInstrumental ? mode : 'vocal';
    this.applyVolumes();
    this.seek(currentT);
    if (wasPlaying) {
      void this.play();
    }
  }

  getMixMode(): AudioMixMode {
    return this.mixMode;
  }

  setPlaybackRate(rate: number) {
    const clamped = Math.max(0.5, Math.min(1.5, rate));
    this.playbackRate = clamped;
    this.vocalAudio.playbackRate = clamped;
    this.instrumentalAudio.playbackRate = clamped;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  isPlaying(): boolean {
    const primary = this.getPrimaryElement();
    return !primary.paused && !primary.ended;
  }

  getCurrentTime(): number {
    return this.getPrimaryElement().currentTime || 0;
  }

  async play() {
    if (!this.vocalUrl) return;
    this.applyVolumes();
    const t = this.getCurrentTime();

    if (this.mixMode === 'instrumental' && this.hasInstrumental) {
      this.instrumentalAudio.currentTime = t;
      await this.instrumentalAudio.play().catch(() => undefined);
    } else if (this.mixMode === 'mix' && this.hasInstrumental) {
      this.vocalAudio.currentTime = t;
      this.instrumentalAudio.currentTime = t;
      await Promise.all([
        this.vocalAudio.play().catch(() => undefined),
        this.instrumentalAudio.play().catch(() => undefined),
      ]);
    } else {
      this.vocalAudio.currentTime = t;
      await this.vocalAudio.play().catch(() => undefined);
    }

    this.startSyncLoop();
    this.emit();
  }

  pause() {
    this.vocalAudio.pause();
    if (this.hasInstrumental) {
      this.instrumentalAudio.pause();
    }
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
    const duration = this.vocalAudio.duration || 0;
    const clamped = Math.max(0, duration > 0 ? Math.min(duration, timeSec) : timeSec);
    if (this.vocalUrl) {
      this.vocalAudio.currentTime = clamped;
    }
    if (this.hasInstrumental && this.instrumentalUrl) {
      this.instrumentalAudio.currentTime = clamped;
    }
    this.emit();
  }

  private extractWaveformAndEnvelope(buffer: AudioBuffer): DecodedVocalData {
    const duration = buffer.duration;
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;

    const ch0 = buffer.getChannelData(0);
    const ch1 = numChannels > 1 ? buffer.getChannelData(1) : null;

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
