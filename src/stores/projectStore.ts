import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface WordToken {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricLine {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words: WordToken[];
}

export interface AudioStemInfo {
  name: string;
  path: string;
  sizeBytes: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  audioBuffer?: AudioBuffer | null;
}

export const useProjectStore = defineStore('project', () => {
  // 1. Song Metadata
  const title = ref('');
  const artist = ref('');
  const album = ref('');

  // 2. Audio Stems
  const vocalStem = ref<AudioStemInfo | null>(null);
  const instrumentalStem = ref<AudioStemInfo | null>(null);

  // 3. Lyrics
  const rawLyrics = ref('');
  const lines = ref<LyricLine[]>([]);

  // 4. UI & Playback state
  const currentView = ref<'setup' | 'editor' | 'export'>('setup');
  const isGenerating = ref(false);
  const generationProgress = ref(0);
  const audioSource = ref<'both' | 'vocal' | 'instrumental'>('both');
  const currentTime = ref(0);
  const isPlaying = ref(false);

  // 5. Visual Styling Configuration
  const styleConfig = ref({
    screenLines: 2 as 1 | 2 | 3 | 4,
    verticalPosition: 'bottom' as 'bottom' | 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Hiragino Sans", sans-serif',
    fontSize: 44,
    fontWeight: '800',
    allCaps: false,
    activeColor: '#00E5FF',     // Neon Cyan
    inactiveColor: '#FFFFFF',   // Crisp White
    outlineColor: '#000000',    // Solid Black
    outlineWidth: 3.5,          // 3.5px stroke
    shadowBlur: 6,
    bgColor: '#0C0D12',
    bgType: 'color' as 'color' | 'image' | 'video',
    bgCustomUrl: '',
    introCard: {
      enabled: true,
      durationSeconds: 4.0,
    },
    outroCard: {
      enabled: true,
      durationSeconds: 4.5,
      message: 'Thank You For Singing!',
    },
  });

  // Computed properties
  const hasVocalStem = computed(() => vocalStem.value !== null);
  const hasInstrumentalStem = computed(() => instrumentalStem.value !== null);
  const canGenerate = computed(() => {
    return hasVocalStem.value && rawLyrics.value.trim().length > 0;
  });

  const lyricStats = computed(() => {
    const text = rawLyrics.value.trim();
    if (!text) return { lines: 0, words: 0, chars: 0, hasCJK: false };
    const lineList = text.split('\n').filter(l => l.trim().length > 0);
    const wordList = text.split(/\s+/).filter(Boolean);
    // CJK detection (Kanji, Hiragana, Katakana)
    const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
    return {
      lines: lineList.length,
      words: wordList.length,
      chars: text.length,
      hasCJK,
    };
  });

  // Actions
  function setVocalStem(info: AudioStemInfo) {
    vocalStem.value = info;
  }

  function setInstrumentalStem(info: AudioStemInfo | null) {
    instrumentalStem.value = info;
  }

  function setMetadata(newTitle?: string, newArtist?: string, newAlbum?: string) {
    if (newTitle !== undefined) title.value = newTitle;
    if (newArtist !== undefined) artist.value = newArtist;
    if (newAlbum !== undefined) album.value = newAlbum;
  }

  // Lyrics Sanitizers
  function stripSectionLabels() {
    // Strips [Verse 1], [Chorus], (Bridge), Intro:, Outro:, chords like [Am], [C#m7]
    const cleaned = rawLyrics.value
      .replace(/\[(?:Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|Hook|Refrain)[^\]]*\]/gi, '')
      .replace(/\((?:Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|Hook|Refrain)[^)]*\)/gi, '')
      .replace(/^(?:Verse|Chorus|Bridge|Pre-Chorus|Outro|Intro|Hook|Refrain)\s*\d*[:\-]?\s*$/gmi, '')
      .replace(/\[[A-G][b#]?(?:m|maj|min|dim|aug|sus)?\d*\]/g, ''); // chords
    rawLyrics.value = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  }

  function collapseBlankLines() {
    rawLyrics.value = rawLyrics.value.replace(/\n{2,}/g, '\n').trim();
  }

  function normalizeSmartQuotes() {
    rawLyrics.value = rawLyrics.value
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...');
  }

  // Baseline auto-timing initializer (for immediate testing & polishing)
  function generateBaselineTiming() {
    if (!canGenerate.value) return;
    isGenerating.value = true;
    generationProgress.value = 10;

    const textLines = rawLyrics.value
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const totalDurationMs = (vocalStem.value?.durationSeconds || 180) * 1000;
    // Leave 4 seconds for intro and 4 seconds for outro
    const availableStartMs = styleConfig.value.introCard.enabled ? 4000 : 1000;
    const availableEndMs = totalDurationMs - (styleConfig.value.outroCard.enabled ? 4500 : 1000);
    const lineTimeSpan = (availableEndMs - availableStartMs) / Math.max(1, textLines.length);

    setTimeout(() => {
      generationProgress.value = 50;
      const parsedLines: LyricLine[] = [];

      textLines.forEach((lineText, lineIdx) => {
        const lineStart = availableStartMs + lineIdx * lineTimeSpan;
        const lineEnd = lineStart + lineTimeSpan * 0.85; // 15% gap between lines

        // Split words, respecting CJK characters
        let tokens: string[] = [];
        if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(lineText)) {
          // If Japanese/CJK, treat each character or space-separated word as token
          tokens = lineText.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]|[A-Za-z0-9']+/g) || lineText.split('');
        } else {
          tokens = lineText.split(/\s+/).filter(Boolean);
        }

        const wordSpan = (lineEnd - lineStart) / Math.max(1, tokens.length);
        const words: WordToken[] = tokens.map((w, wIdx) => ({
          id: `w-${lineIdx}-${wIdx}`,
          text: w,
          startMs: Math.round(lineStart + wIdx * wordSpan),
          endMs: Math.round(lineStart + (wIdx + 1) * wordSpan - 20),
        }));

        parsedLines.push({
          id: `line-${lineIdx}`,
          text: lineText,
          startMs: Math.round(lineStart),
          endMs: Math.round(lineEnd),
          words,
        });
      });

      generationProgress.value = 100;
      setTimeout(() => {
        lines.value = parsedLines;
        isGenerating.value = false;
        generationProgress.value = 0;
        currentView.value = 'editor'; // Transition to polishing editor
      }, 400);
    }, 600);
  }

  return {
    title,
    artist,
    album,
    vocalStem,
    instrumentalStem,
    rawLyrics,
    lines,
    currentView,
    isGenerating,
    generationProgress,
    audioSource,
    currentTime,
    isPlaying,
    styleConfig,
    hasVocalStem,
    hasInstrumentalStem,
    canGenerate,
    lyricStats,
    setVocalStem,
    setInstrumentalStem,
    setMetadata,
    stripSectionLabels,
    collapseBlankLines,
    normalizeSmartQuotes,
    generateBaselineTiming,
  };
});

