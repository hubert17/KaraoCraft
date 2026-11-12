import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { audioEngine, fileToBase64, type AudioMixMode } from '../services/audioEngine';
import {
  alignLyricsWithWaveform,
  alignLyricsWithWhisperWords,
  assignFramesToLines,
  resyncWordsWithinLines,
  type AlignedLyricLine,
  type WhisperWordInput,
} from '../services/alignmentEngine';
import {
  generateAssSubtitle,
  generateEnhancedLrc,
  getResolutionDimensions,
  triggerBrowserDownload,
  type KaraokeVisualOptions,
} from '../services/subtitleExporter';

export type AppScreen = 'setup' | 'editor';
export type EditorTab = 'basics' | 'options' | 'line-timings' | 'word-timings' | 'video';

export interface SystemCapabilities {
  ffmpegAvailable: boolean;
  ffmpegPath: string | null;
  libassAvailable: boolean;
  whisperAvailable: boolean;
  whisperEngine: string | null;
}

interface WhisperAlignmentResponse {
  available: boolean;
  engine: string | null;
  words: WhisperWordInput[];
}

interface RenderMp4Response {
  outputPath: string;
  encoderUsed: string;
}

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

export const useProjectStore = defineStore('project', () => {
  // Navigation & Modals
  const screen = ref<AppScreen>('setup');
  const activeTab = ref<EditorTab>('line-timings');
  const showResyncModal = ref(false);
  const showUvrGuideModal = ref(false);

  // System Capabilities (Tauri backend)
  const isTauriEnv = ref(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  const systemCaps = ref<SystemCapabilities>({
    ffmpegAvailable: false,
    ffmpegPath: null,
    libassAvailable: false,
    whisperAvailable: false,
    whisperEngine: null,
  });

  // Audio Files & Decoded Waveform
  const vocalFile = ref<File | null>(null);
  const vocalFileName = ref('');
  const isDecodingAudio = ref(false);
  const audioError = ref<string | null>(null);

  const instrumentalFile = ref<File | null>(null);
  const instrumentalFileName = ref('');

  const duration = ref(0);
  const waveformPeaks = ref<Float32Array | null>(null);
  const peaksPerSecond = ref(120);
  const rmsEnvelope = ref<Float32Array | null>(null);
  const rmsHz = ref(50);

  // Transport State
  const currentTime = ref(0);
  const isPlaying = ref(false);
  const playbackRate = ref(1.0);
  const mixMode = ref<AudioMixMode>('vocal');

  // Song Metadata & Lyrics
  const title = ref('');
  const artist = ref('');
  const rawLyrics = ref('');
  const syncedLyricsSnapshot = ref('');

  // Alignment & Timing State
  const lines = ref<AlignedLyricLine[]>([]);
  const selectedLineIndex = ref(0);
  const selectedWordId = ref<string | null>(null);
  const isAligning = ref(false);
  const alignmentMessage = ref('');
  const alignmentSource = ref<'whisper' | 'waveform' | 'manual'>('waveform');

  // Undo History (JSON snapshots of lines)
  const undoStack = ref<string[]>([]);

  // Export State
  const isRenderingMp4 = ref(false);
  const lastExportedMp4Path = ref<string | null>(null);
  const lastEncoderUsed = ref<string | null>(null);
  const exportError = ref<string | null>(null);

  // Unified Visual Options (Slides 3, 4, 5)
  const options = ref<KaraokeVisualOptions>({
    aspectRatio: '4:3',
    bgColor: '#000000',
    textSize: 32,
    activeColor: '#3dbeff',
    unsungColor: '#ffffff',
    outlineColor: '#004bfa',
    bold: true,
    outline: true,
    hCenter: true,
    vCenter: true,
    linesPerFrame: 4,
    boxLeft: 0.07,
    boxTop: 0.21,
    boxWidth: 0.86,
    boxHeight: 0.58,
  });

  // Bind audioEngine time listener once
  audioEngine.subscribe((t, playing) => {
    currentTime.value = t;
    isPlaying.value = playing;
  });

  const canSubmit = computed(() => {
    return Boolean(vocalFile.value && !isDecodingAudio.value && rawLyrics.value.trim().length > 0);
  });

  const lyricsModifiedSinceSync = computed(() => {
    return syncedLyricsSnapshot.value !== '' && rawLyrics.value.trim() !== syncedLyricsSnapshot.value.trim();
  });

  const totalWordsCount = computed(() => {
    return lines.value.reduce((acc, l) => acc + l.words.length, 0);
  });

  const totalFramesCount = computed(() => {
    if (lines.value.length === 0) return 1;
    return (lines.value[lines.value.length - 1]?.frameIndex ?? 0) + 1;
  });

  const activeLineIndexAtPlayhead = computed(() => {
    const t = currentTime.value;
    for (let i = 0; i < lines.value.length; i++) {
      const l = lines.value[i];
      if (t >= l.startSec && t <= l.endSec) {
        return i;
      }
    }
    return -1;
  });

  async function detectSystemCapabilities() {
    isTauriEnv.value = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauriEnv.value) return;
    try {
      const caps = await invoke<SystemCapabilities>('check_system_capabilities');
      systemCaps.value = caps;
    } catch {
      // Running in browser dev mode
    }
  }

  function inferMetadataFromFilename(fileName: string) {
    const dotIdx = fileName.lastIndexOf('.');
    const base = (dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName)
      .replace(/[_]+/g, ' ')
      .replace(/\(vocals?\)|\[vocals?\]|-?\s*vocals?\s*stem|-?\s*isolated\s*vocals?/gi, '')
      .trim();

    if (!base) return;
    const parts = base.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      if (!artist.value.trim()) artist.value = parts[0];
      if (!title.value.trim()) title.value = parts.slice(1).join(' - ');
    } else if (!title.value.trim()) {
      title.value = base;
    }
  }

  async function selectVocalFile(file: File) {
    audioError.value = null;
    isDecodingAudio.value = true;
    vocalFile.value = file;
    vocalFileName.value = file.name;
    inferMetadataFromFilename(file.name);

    try {
      const decoded = await audioEngine.loadVocalFile(file);
      duration.value = decoded.duration;
      waveformPeaks.value = decoded.peaks;
      peaksPerSecond.value = decoded.peaksPerSecond;
      rmsEnvelope.value = decoded.rmsEnvelope;
      rmsHz.value = decoded.rmsHz;
      currentTime.value = 0;
    } catch (err) {
      audioError.value =
        err instanceof Error
          ? `Could not decode audio file: ${err.message}`
          : 'Could not decode this audio format. Try MP3, WAV, M4A, or FLAC.';
      vocalFile.value = null;
      vocalFileName.value = '';
    } finally {
      isDecodingAudio.value = false;
    }
  }

  function selectInstrumentalFile(file: File | null) {
    instrumentalFile.value = file;
    instrumentalFileName.value = file ? file.name : '';
    audioEngine.loadInstrumentalFile(file);
    if (file) {
      setMixMode('instrumental');
    } else {
      setMixMode('vocal');
    }
  }

  function setMixMode(mode: AudioMixMode) {
    audioEngine.setMixMode(mode);
    mixMode.value = audioEngine.getMixMode();
  }

  function setPlaybackRate(rate: number) {
    audioEngine.setPlaybackRate(rate);
    playbackRate.value = audioEngine.getPlaybackRate();
  }

  async function togglePlay() {
    await audioEngine.togglePlay();
  }

  function pauseAudio() {
    audioEngine.pause();
  }

  function seekAudio(sec: number) {
    audioEngine.seek(sec);
  }

  function pushUndoSnapshot() {
    const snap = JSON.stringify(lines.value);
    if (undoStack.value.length > 0 && undoStack.value[undoStack.value.length - 1] === snap) {
      return;
    }
    undoStack.value.push(snap);
    if (undoStack.value.length > 35) {
      undoStack.value.shift();
    }
  }

  function undo() {
    const prev = undoStack.value.pop();
    if (!prev) return;
    try {
      const restored = JSON.parse(prev) as AlignedLyricLine[];
      lines.value = restored;
    } catch {
      // Ignore malformed snapshot
    }
  }

  function stripSectionHeaders() {
    const normalized = rawLyrics.value
      .split(CR + LF)
      .join(LF)
      .split(CR)
      .join(LF);
    const cleaned = normalized
      .split(LF)
      .filter((line) => {
        const t = line.trim();
        if (!t) return true;
        // Remove [Verse 1], [Chorus], (Instrumental), etc.
        if (t.startsWith('[') && t.endsWith(']') && t.length <= 40) return false;
        return true;
      })
      .join(LF);
    rawLyrics.value = cleaned.trim();
  }

  async function runFullAlignment() {
    if (!rawLyrics.value.trim()) return;
    isAligning.value = true;
    alignmentMessage.value = 'Analyzing vocal phrasing & syllables...';

    try {
      let aligned: AlignedLyricLine[] | null = null;

      if (isTauriEnv.value && systemCaps.value.whisperAvailable && vocalFile.value) {
        alignmentMessage.value = `Running local AI word alignment (${systemCaps.value.whisperEngine})...`;
        try {
          const ext = vocalFile.value.name.split('.').pop() || 'mp3';
          const b64 = await fileToBase64(vocalFile.value);
          const resp = await invoke<WhisperAlignmentResponse>('transcribe_whisper_words', {
            audioBase64: b64,
            audioExt: ext,
          });
          if (resp.available && resp.words.length >= 3) {
            aligned = alignLyricsWithWhisperWords(
              rawLyrics.value,
              resp.words,
              duration.value,
              rmsEnvelope.value,
              rmsHz.value,
              options.value.linesPerFrame
            );
            alignmentSource.value = 'whisper';
          }
        } catch {
          // Fall back gracefully to vocal envelope aligner
        }
      }

      if (!aligned) {
        aligned = alignLyricsWithWaveform(
          rawLyrics.value,
          duration.value,
          rmsEnvelope.value,
          rmsHz.value,
          options.value.linesPerFrame
        );
        alignmentSource.value = 'waveform';
      }

      lines.value = aligned;
      syncedLyricsSnapshot.value = rawLyrics.value.trim();
      selectedLineIndex.value = 0;
      selectedWordId.value = aligned[0]?.words[0]?.id ?? null;
      undoStack.value = [];
    } finally {
      isAligning.value = false;
      alignmentMessage.value = '';
    }
  }

  async function submitSetup() {
    if (!canSubmit.value) return;
    await runFullAlignment();
    screen.value = 'editor';
    activeTab.value = 'line-timings';
  }

  async function resyncWordsFromCurrentLines() {
    if (lines.value.length === 0) return;
    pushUndoSnapshot();
    lines.value = resyncWordsWithinLines(lines.value, rmsEnvelope.value, rmsHz.value);
    showResyncModal.value = false;
  }

  async function resetAndResyncAll() {
    pushUndoSnapshot();
    await runFullAlignment();
    showResyncModal.value = false;
  }

  function setLinesPerFrame(newCount: number) {
    const clamped = Math.max(1, Math.min(8, Math.round(newCount)));
    options.value.linesPerFrame = clamped;
    assignFramesToLines(lines.value, clamped);
  }

  function updateBoundingBox(patch: Partial<Pick<KaraokeVisualOptions, 'boxLeft' | 'boxTop' | 'boxWidth' | 'boxHeight'>>) {
    let left = patch.boxLeft ?? options.value.boxLeft;
    let top = patch.boxTop ?? options.value.boxTop;
    let width = patch.boxWidth ?? options.value.boxWidth;
    let height = patch.boxHeight ?? options.value.boxHeight;

    width = Math.max(0.25, Math.min(0.96, width));
    height = Math.max(0.16, Math.min(0.92, height));

    if (options.value.hCenter) {
      left = (1 - width) * 0.5;
    } else {
      left = Math.max(0.02, Math.min(0.98 - width, left));
    }

    if (options.value.vCenter) {
      top = (1 - height) * 0.5;
    } else {
      top = Math.max(0.03, Math.min(0.97 - height, top));
    }

    options.value.boxLeft = Number(left.toFixed(4));
    options.value.boxTop = Number(top.toFixed(4));
    options.value.boxWidth = Number(width.toFixed(4));
    options.value.boxHeight = Number(height.toFixed(4));
  }

  function toggleHCenter(enabled: boolean) {
    options.value.hCenter = enabled;
    if (enabled) {
      options.value.boxLeft = Number(((1 - options.value.boxWidth) * 0.5).toFixed(4));
    }
  }

  function toggleVCenter(enabled: boolean) {
    options.value.vCenter = enabled;
    if (enabled) {
      options.value.boxTop = Number(((1 - options.value.boxHeight) * 0.5).toFixed(4));
    }
  }

  /**
   * Updates a line's [startSec, endSec] while clamping cleanly against adjacent lines
   * and scaling its child words proportionally.
   */
  function updateLineTiming(lineIdx: number, rawStart: number, rawEnd: number) {
    const line = lines.value[lineIdx];
    if (!line) return;

    const minAllowed = lineIdx > 0 ? lines.value[lineIdx - 1].endSec + 0.01 : 0;
    const maxAllowed =
      lineIdx < lines.value.length - 1
        ? lines.value[lineIdx + 1].startSec - 0.01
        : Math.max(duration.value, line.endSec + 5);

    const minDur = Math.max(0.12, line.words.length * 0.04);
    if (maxAllowed - minAllowed < minDur) return;

    let nextStart = Math.max(minAllowed, Math.min(maxAllowed - minDur, rawStart));
    let nextEnd = Math.max(nextStart + minDur, Math.min(maxAllowed, rawEnd));

    const oldStart = line.startSec;
    const oldSpan = Math.max(0.001, line.endSec - oldStart);
    const newSpan = nextEnd - nextStart;

    line.words.forEach((w) => {
      const relS = (w.startSec - oldStart) / oldSpan;
      const relE = (w.endSec - oldStart) / oldSpan;
      w.startSec = Number((nextStart + relS * newSpan).toFixed(3));
      w.endSec = Number((nextStart + relE * newSpan).toFixed(3));
    });

    line.startSec = Number(nextStart.toFixed(3));
    line.endSec = Number(nextEnd.toFixed(3));
    alignmentSource.value = 'manual';
  }

  /**
   * Updates an individual word's [startSec, endSec] in Word Timings view,
   * clamping cleanly against neighboring words and syncing parent line bounds.
   */
  function updateWordTiming(lineIdx: number, wordIdx: number, rawStart: number, rawEnd: number) {
    const line = lines.value[lineIdx];
    if (!line) return;
    const word = line.words[wordIdx];
    if (!word) return;

    let minAllowed = 0;
    if (wordIdx > 0) {
      minAllowed = line.words[wordIdx - 1].endSec + 0.005;
    } else if (lineIdx > 0) {
      minAllowed = lines.value[lineIdx - 1].endSec + 0.01;
    }

    let maxAllowed = Math.max(duration.value, line.endSec + 5);
    if (wordIdx < line.words.length - 1) {
      maxAllowed = line.words[wordIdx + 1].startSec - 0.005;
    } else if (lineIdx < lines.value.length - 1) {
      maxAllowed = lines.value[lineIdx + 1].startSec - 0.01;
    }

    const minDur = 0.04;
    if (maxAllowed - minAllowed < minDur) return;

    const nextStart = Math.max(minAllowed, Math.min(maxAllowed - minDur, rawStart));
    const nextEnd = Math.max(nextStart + minDur, Math.min(maxAllowed, rawEnd));

    word.startSec = Number(nextStart.toFixed(3));
    word.endSec = Number(nextEnd.toFixed(3));

    line.startSec = line.words[0].startSec;
    line.endSec = line.words[line.words.length - 1].endSec;
    alignmentSource.value = 'manual';
  }

  /**
   * Live Tap-Sync helper: stamps the selected line's start to currentTime and advances selection!
   */
  function tapSyncCurrentLine() {
    if (lines.value.length === 0) return;
    pushUndoSnapshot();
    const idx = Math.max(0, Math.min(lines.value.length - 1, selectedLineIndex.value));
    const t = Number(currentTime.value.toFixed(3));
    const curLine = lines.value[idx];

    // Trim previous line's end if it overlaps currentTime
    if (idx > 0 && lines.value[idx - 1].endSec > t - 0.02) {
      const prev = lines.value[idx - 1];
      const trimmedEnd = Math.max(prev.startSec + 0.12, t - 0.02);
      updateLineTiming(idx - 1, prev.startSec, trimmedEnd);
    }

    const curDur = Math.max(0.8, curLine.endSec - curLine.startSec);
    const maxNext = idx < lines.value.length - 1 ? lines.value[idx + 1].endSec - 0.15 : duration.value;
    // Also push next line's start forward if needed so curLine has room
    if (idx < lines.value.length - 1 && lines.value[idx + 1].startSec < t + 0.4) {
      const next = lines.value[idx + 1];
      const shiftedStart = Math.min(next.endSec - 0.12, t + Math.min(curDur, 1.5));
      if (shiftedStart > next.startSec) {
        updateLineTiming(idx + 1, shiftedStart, Math.max(shiftedStart + 0.3, next.endSec));
      }
    }

    updateLineTiming(idx, t, Math.min(maxNext, t + curDur));
    if (idx < lines.value.length - 1) {
      selectedLineIndex.value = idx + 1;
    }
  }

  function sanitizeFileBase(raw: string, fallback: string): string {
    const trimmed = raw.trim() || fallback;
    const bs = String.fromCharCode(92);
    return trimmed
      .split('')
      .map((c) => ('/:*?"<>|'.includes(c) || c === bs ? '-' : c))
      .join('');
  }

  function exportAssFile() {
    const content = generateAssSubtitle({
      title: title.value,
      artist: artist.value,
      lines: lines.value,
      options: options.value,
      durationSec: duration.value,
      quality: '1080p',
    });
    const safeName = sanitizeFileBase(title.value, 'KaraoCraft_Lyrics');
    triggerBrowserDownload(`${safeName}.ass`, content, 'text/plain;charset=utf-8');
  }

  function exportLrcFile() {
    const content = generateEnhancedLrc({
      title: title.value,
      artist: artist.value,
      lines: lines.value,
    });
    const safeName = sanitizeFileBase(title.value, 'KaraoCraft_Lyrics');
    triggerBrowserDownload(`${safeName}.lrc`, content, 'text/plain;charset=utf-8');
  }

  function saveProjectFile() {
    const payload = {
      version: 2,
      savedAt: new Date().toISOString(),
      title: title.value,
      artist: artist.value,
      rawLyrics: rawLyrics.value,
      vocalFileName: vocalFileName.value,
      instrumentalFileName: instrumentalFileName.value,
      duration: duration.value,
      options: options.value,
      lines: lines.value,
    };
    const safeName = sanitizeFileBase(title.value, 'KaraoCraft_Project');
    triggerBrowserDownload(
      `${safeName}.karaocraft.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  }

  async function loadProjectFile(file: File) {
    const text = await file.text();
    const data = JSON.parse(text);
    if (typeof data.title === 'string') title.value = data.title;
    if (typeof data.artist === 'string') artist.value = data.artist;
    if (typeof data.rawLyrics === 'string') {
      rawLyrics.value = data.rawLyrics;
      syncedLyricsSnapshot.value = data.rawLyrics.trim();
    }
    if (data.options && typeof data.options === 'object') {
      options.value = { ...options.value, ...data.options };
    }
    if (Array.isArray(data.lines) && data.lines.length > 0) {
      lines.value = data.lines;
      assignFramesToLines(lines.value, options.value.linesPerFrame);
      if (!duration.value && typeof data.duration === 'number') {
        duration.value = data.duration;
      }
      screen.value = 'editor';
      activeTab.value = 'line-timings';
    }
  }

  async function renderMp4Video(quality: '720p' | '1080p', audioChoice: 'instrumental' | 'vocal') {
    const sourceFile =
      audioChoice === 'instrumental' && instrumentalFile.value
        ? instrumentalFile.value
        : vocalFile.value;

    if (!sourceFile) {
      exportError.value = 'Please select an audio file before exporting video.';
      return;
    }

    isRenderingMp4.value = true;
    exportError.value = null;
    lastExportedMp4Path.value = null;

    try {
      const assContent = generateAssSubtitle({
        title: title.value,
        artist: artist.value,
        lines: lines.value,
        options: options.value,
        durationSec: duration.value,
        quality,
      });

      const { width, height } = getResolutionDimensions(options.value.aspectRatio, quality);
      const ext = sourceFile.name.split('.').pop() || 'mp3';
      const audioBase64 = await fileToBase64(sourceFile);

      const baseTitle = [artist.value.trim(), title.value.trim()].filter(Boolean).join(' - ') || 'KaraoCraft';
      const outputFilename = `${baseTitle} (Karaoke ${quality}).mp4`;

      if (isTauriEnv.value) {
        const res = await invoke<RenderMp4Response>('render_karaoke_mp4', {
          request: {
            assContent,
            audioBase64,
            audioExt: ext,
            bgColor: options.value.bgColor,
            width,
            height,
            durationSec: duration.value || 180,
            outputFilename,
          },
        });
        lastExportedMp4Path.value = res.outputPath;
        lastEncoderUsed.value = res.encoderUsed;
      } else {
        exportError.value =
          'Native MP4 hardware rendering runs inside the Tauri macOS desktop app (`npm run tauri dev`). In browser preview mode, you can download the exact .ASS or .LRC karaoke files right below!';
      }
    } catch (err) {
      exportError.value = err instanceof Error ? err.message : String(err);
    } finally {
      isRenderingMp4.value = false;
    }
  }

  async function revealLastMp4InFinder() {
    if (!lastExportedMp4Path.value || !isTauriEnv.value) return;
    try {
      await invoke('reveal_in_finder', { path: lastExportedMp4Path.value });
    } catch {
      // Ignore
    }
  }

  return {
    screen,
    activeTab,
    showResyncModal,
    showUvrGuideModal,
    isTauriEnv,
    systemCaps,
    vocalFile,
    vocalFileName,
    isDecodingAudio,
    audioError,
    instrumentalFile,
    instrumentalFileName,
    duration,
    waveformPeaks,
    peaksPerSecond,
    rmsEnvelope,
    rmsHz,
    currentTime,
    isPlaying,
    playbackRate,
    mixMode,
    title,
    artist,
    rawLyrics,
    syncedLyricsSnapshot,
    lines,
    selectedLineIndex,
    selectedWordId,
    isAligning,
    alignmentMessage,
    alignmentSource,
    undoStack,
    isRenderingMp4,
    lastExportedMp4Path,
    lastEncoderUsed,
    exportError,
    options,
    canSubmit,
    lyricsModifiedSinceSync,
    totalWordsCount,
    totalFramesCount,
    activeLineIndexAtPlayhead,
    detectSystemCapabilities,
    selectVocalFile,
    selectInstrumentalFile,
    setMixMode,
    setPlaybackRate,
    togglePlay,
    pauseAudio,
    seekAudio,
    pushUndoSnapshot,
    undo,
    stripSectionHeaders,
    runFullAlignment,
    submitSetup,
    resyncWordsFromCurrentLines,
    resetAndResyncAll,
    setLinesPerFrame,
    updateBoundingBox,
    toggleHCenter,
    toggleVCenter,
    updateLineTiming,
    updateWordTiming,
    tapSyncCurrentLine,
    exportAssFile,
    exportLrcFile,
    saveProjectFile,
    loadProjectFile,
    renderMp4Video,
    revealLastMp4InFinder,
  };
});
