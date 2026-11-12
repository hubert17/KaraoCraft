export interface WordSegment {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
}

export interface AlignedLyricLine {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  stanzaBreakBefore: boolean;
  frameIndex: number;
  words: WordSegment[];
}

export interface WhisperWordInput {
  word: string;
  start: number;
  end: number;
}

interface VocalIsland {
  startSec: number;
  endSec: number;
  energySum: number;
}

const VOWELS = 'aeiouyáéíóúàèìòùâêîôûäëïöüāēīōū';

function isVowelChar(ch: string): boolean {
  return VOWELS.includes(ch.toLowerCase());
}

function isCjkOrKana(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) || // Hiragana & Katakana
    (code >= 0x3400 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xac00 && code <= 0xd7af)    // Hangul
  );
}

/**
 * Estimates spoken/sung syllable weight for English, Romaji, European, and CJK/Kana words.
 */
export function estimateWordWeight(word: string, isLineFinal = false): number {
  const trimmed = word.trim();
  if (!trimmed) return 1;

  let syllables = 0;
  let prevVowel = false;

  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    const ch = trimmed[i];
    if (isCjkOrKana(code)) {
      syllables += 1.05;
      prevVowel = false;
    } else if (isVowelChar(ch)) {
      if (!prevVowel) {
        syllables += 1;
      }
      prevVowel = true;
    } else if (ch === '-' || ch === 'ー') {
      // Long vowel / syllable separator like "se-eta" or "supi-do"
      syllables += 0.35;
      prevVowel = false;
    } else {
      prevVowel = false;
    }
  }

  const base = Math.max(1, syllables);
  // Singers typically sustain the final word of a lyric phrase slightly longer
  return isLineFinal ? base * 1.28 : base;
}

const TAB_CHAR = String.fromCharCode(9);
const LF_CHAR = String.fromCharCode(10);
const CR_CHAR = String.fromCharCode(13);

export function splitLineIntoWords(lineText: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (let i = 0; i < lineText.length; i++) {
    const ch = lineText[i];
    const code = lineText.charCodeAt(i);
    if (ch === ' ' || ch === TAB_CHAR) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else if (isCjkOrKana(code) && !lineText.includes(' ')) {
      // If pure unspaced CJK/Japanese line, group into natural 2-char mora chunks
      current += ch;
      if (current.length >= 2) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

export interface ParsedRawLine {
  text: string;
  words: string[];
  stanzaBreakBefore: boolean;
  weight: number;
}

export function parseRawLyrics(rawLyrics: string): ParsedRawLine[] {
  const normalized = rawLyrics
    .split(CR_CHAR + LF_CHAR)
    .join(LF_CHAR)
    .split(CR_CHAR)
    .join(LF_CHAR);
  const rawLines = normalized.split(LF_CHAR);

  const parsed: ParsedRawLine[] = [];
  let sawBlankSinceLast = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (parsed.length > 0) {
        sawBlankSinceLast = true;
      }
      continue;
    }
    const words = splitLineIntoWords(trimmed);
    if (words.length === 0) continue;

    let lineWeight = 0;
    words.forEach((w, idx) => {
      lineWeight += estimateWordWeight(w, idx === words.length - 1);
    });

    parsed.push({
      text: trimmed,
      words,
      stanzaBreakBefore: sawBlankSinceLast,
      weight: Math.max(1, lineWeight),
    });
    sawBlankSinceLast = false;
  }

  return parsed;
}

function detectVocalIslands(
  rmsEnvelope: Float32Array,
  rmsHz: number,
  durationSec: number
): VocalIsland[] {
  if (rmsEnvelope.length === 0 || durationSec <= 0) {
    return [{ startSec: 0, endSec: Math.max(1, durationSec), energySum: 1 }];
  }

  // Smooth envelope over ~60ms (3 frames at 50 Hz)
  const n = rmsEnvelope.length;
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rmsEnvelope[Math.max(0, i - 1)];
    const b = rmsEnvelope[i];
    const c = rmsEnvelope[Math.min(n - 1, i + 1)];
    smooth[i] = (a + 2 * b + c) * 0.25;
  }

  // Compute adaptive noise floor and vocal peak percentiles
  const sorted = Array.from(smooth).sort((x, y) => x - y);
  const p20 = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
  const p85 = sorted[Math.floor(sorted.length * 0.85)] ?? 0.5;
  const threshold = Math.max(0.035, p20 + (p85 - p20) * 0.16);

  // Extract raw active segments
  const rawIslands: { startFrame: number; endFrame: number }[] = [];
  let inActive = false;
  let startF = 0;

  for (let i = 0; i < n; i++) {
    if (smooth[i] >= threshold) {
      if (!inActive) {
        inActive = true;
        startF = i;
      }
    } else if (inActive) {
      inActive = false;
      rawIslands.push({ startFrame: startF, endFrame: i });
    }
  }
  if (inActive) {
    rawIslands.push({ startFrame: startF, endFrame: n });
  }

  if (rawIslands.length === 0) {
    return [
      {
        startSec: Math.min(1.0, durationSec * 0.05),
        endSec: Math.max(1.5, durationSec * 0.95),
        energySum: 1,
      },
    ];
  }

  // Merge micro-gaps (< 240ms = 12 frames) inside continuous singing
  const mergeGapFrames = Math.round(0.24 * rmsHz);
  const minIslandFrames = Math.round(0.14 * rmsHz);

  const merged: { startFrame: number; endFrame: number }[] = [];
  for (const seg of rawIslands) {
    if (merged.length === 0) {
      merged.push({ ...seg });
    } else {
      const prev = merged[merged.length - 1];
      if (seg.startFrame - prev.endFrame <= mergeGapFrames) {
        prev.endFrame = seg.endFrame;
      } else {
        merged.push({ ...seg });
      }
    }
  }

  const filtered = merged.filter((m) => m.endFrame - m.startFrame >= minIslandFrames);
  const source = filtered.length > 0 ? filtered : merged;

  return source.map((seg) => {
    let eSum = 0;
    for (let f = seg.startFrame; f < seg.endFrame; f++) {
      eSum += smooth[f] + 0.05;
    }
    // Pad onset slightly (-40ms) and release (+80ms) for natural karaoke reading
    const startSec = Math.max(0, seg.startFrame / rmsHz - 0.04);
    const endSec = Math.min(durationSec, seg.endFrame / rmsHz + 0.08);
    return {
      startSec,
      endSec: Math.max(startSec + 0.15, endSec),
      energySum: Math.max(0.05, eSum),
    };
  });
}

/**
 * Distributes words inside a single line [lineStart, lineEnd] by blending
 * syllable weights with actual vocal onset/dip contours inside that slice.
 */
export function distributeWordsInLine(
  lineIndex: number,
  words: string[],
  lineStart: number,
  lineEnd: number,
  rmsEnvelope: Float32Array | null,
  rmsHz: number
): WordSegment[] {
  const safeStart = Math.max(0, lineStart);
  const safeEnd = Math.max(safeStart + 0.12, lineEnd);
  const span = safeEnd - safeStart;

  if (words.length === 0) return [];
  if (words.length === 1) {
    return [
      {
        id: `word-${lineIndex}-0`,
        text: words[0],
        startSec: Number(safeStart.toFixed(3)),
        endSec: Number(safeEnd.toFixed(3)),
      },
    ];
  }

  const weights = words.map((w, idx) => estimateWordWeight(w, idx === words.length - 1));
  const totalWeight = weights.reduce((acc, v) => acc + v, 0) || 1;

  // Compute ideal cumulative fractions [0..1]
  const boundaries: number[] = [safeStart];
  let cumulative = 0;

  for (let i = 0; i < words.length - 1; i++) {
    cumulative += weights[i] / totalWeight;
    const expectedTime = safeStart + span * cumulative;

    // Snap boundary toward nearest local energy valley within ±12% of line span (max ±0.22s)
    let snappedTime = expectedTime;
    if (rmsEnvelope && rmsEnvelope.length > 0 && rmsHz > 0) {
      const searchRadius = Math.min(0.22, (span / words.length) * 0.38);
      const minF = Math.max(0, Math.floor((expectedTime - searchRadius) * rmsHz));
      const maxF = Math.min(rmsEnvelope.length - 1, Math.ceil((expectedTime + searchRadius) * rmsHz));
      let bestScore = Infinity;
      for (let f = minF; f <= maxF; f++) {
        const t = f / rmsHz;
        const distPenalty = Math.abs(t - expectedTime) / Math.max(0.05, searchRadius) * 0.18;
        const score = rmsEnvelope[f] + distPenalty;
        if (score < bestScore) {
          bestScore = score;
          snappedTime = t;
        }
      }
    }

    // Ensure monotonic minimum word width (at least 60ms per word when possible)
    const minWordDur = Math.min(0.06, span / (words.length * 2));
    const prevBoundary = boundaries[boundaries.length - 1];
    const maxAllowed = safeEnd - minWordDur * (words.length - 1 - i);
    const clamped = Math.max(prevBoundary + minWordDur, Math.min(maxAllowed, snappedTime));
    boundaries.push(clamped);
  }
  boundaries.push(safeEnd);

  return words.map((text, idx) => ({
    id: `word-${lineIndex}-${idx}`,
    text,
    startSec: Number(boundaries[idx].toFixed(3)),
    endSec: Number(boundaries[idx + 1].toFixed(3)),
  }));
}

/**
 * Assigns frame numbers (1-based index stored as 0-based frameIndex) using linesPerFrame
 * and stanza breaks, matching Croonify's screen frame pagination.
 */
export function assignFramesToLines(lines: AlignedLyricLine[], linesPerFrame: number): void {
  const maxLines = Math.max(1, Math.round(linesPerFrame));
  let currentFrame = 0;
  let countInFrame = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i > 0 && (line.stanzaBreakBefore || countInFrame >= maxLines)) {
      currentFrame++;
      countInFrame = 0;
    }
    line.frameIndex = currentFrame;
    countInFrame++;
  }
}

/**
 * Built-in Vocal Envelope & Phrase Island Alignment.
 * Maps lyric stanzas and lines onto real non-silent vocal phrases in the decoded stem.
 */
export function alignLyricsWithWaveform(
  rawLyrics: string,
  durationSec: number,
  rmsEnvelope: Float32Array | null,
  rmsHz: number,
  linesPerFrame = 4
): AlignedLyricLine[] {
  const parsedLines = parseRawLyrics(rawLyrics);
  if (parsedLines.length === 0) return [];

  const safeDuration = Math.max(2.0, durationSec || 180);

  if (!rmsEnvelope || rmsEnvelope.length === 0) {
    // Fallback when no buffer is available yet
    const startPad = Math.min(2.0, safeDuration * 0.05);
    const endPad = Math.min(2.0, safeDuration * 0.04);
    const usable = Math.max(1.0, safeDuration - startPad - endPad);
    const totalW = parsedLines.reduce((s, l) => s + l.weight + (l.stanzaBreakBefore ? 1.5 : 0.3), 0);

    let cursor = startPad;
    const result: AlignedLyricLine[] = parsedLines.map((pl, idx) => {
      if (pl.stanzaBreakBefore) {
        cursor += (1.2 / totalW) * usable;
      }
      const lineDur = Math.max(0.4, (pl.weight / totalW) * usable);
      const lineStart = cursor;
      const lineEnd = Math.min(safeDuration, lineStart + lineDur);
      cursor = lineEnd + (0.3 / totalW) * usable;

      return {
        id: `line-${idx}`,
        text: pl.text,
        startSec: Number(lineStart.toFixed(3)),
        endSec: Number(lineEnd.toFixed(3)),
        stanzaBreakBefore: pl.stanzaBreakBefore,
        frameIndex: 0,
        words: distributeWordsInLine(idx, pl.words, lineStart, lineEnd, null, rmsHz),
      };
    });

    assignFramesToLines(result, linesPerFrame);
    return result;
  }

  const islands = detectVocalIslands(rmsEnvelope, rmsHz, safeDuration);

  // Build cumulative vocal-time mapping across all detected vocal islands
  // so silence gaps (intro, instrumental breaks, outro) are naturally skipped!
  const totalIslandDuration = islands.reduce((acc, isl) => acc + (isl.endSec - isl.startSec), 0);
  const totalLyricWeight = parsedLines.reduce(
    (acc, pl, idx) => acc + pl.weight + (idx > 0 ? (pl.stanzaBreakBefore ? 1.1 : 0.22) : 0),
    0
  );

  // Convert virtual active-singing cursor [0 .. totalIslandDuration] -> real audio timestamp
  const mapActiveTimeToAudio = (activePos: number): number => {
    const clampedPos = Math.max(0, Math.min(totalIslandDuration, activePos));
    let rem = clampedPos;
    for (const isl of islands) {
      const len = isl.endSec - isl.startSec;
      if (rem <= len + 1e-6) {
        return isl.startSec + Math.min(len, rem);
      }
      rem -= len;
    }
    return islands[islands.length - 1].endSec;
  };

  let activeCursor = 0;
  const aligned: AlignedLyricLine[] = [];

  for (let i = 0; i < parsedLines.length; i++) {
    const pl = parsedLines[i];
    if (i > 0) {
      const gapWeight = pl.stanzaBreakBefore ? 1.1 : 0.22;
      activeCursor += (gapWeight / totalLyricWeight) * totalIslandDuration;
    }

    const activeSpan = (pl.weight / totalLyricWeight) * totalIslandDuration;
    let rawStart = mapActiveTimeToAudio(activeCursor);
    let rawEnd = mapActiveTimeToAudio(activeCursor + activeSpan);
    activeCursor += activeSpan;

    // Snap line start forward if rawStart lands inside a silence gap right before an island
    for (const isl of islands) {
      if (rawStart < isl.startSec && rawEnd > isl.startSec + 0.12) {
        // Don't span across a big instrumental break inside a single lyric line
        if (isl.startSec - rawStart > 0.65) {
          rawStart = isl.startSec;
        }
        break;
      }
    }

    // Refine line end so it doesn't trail across a >0.7s silence gap into the next phrase
    for (const isl of islands) {
      if (rawStart >= isl.startSec - 0.05 && rawStart < isl.endSec && rawEnd > isl.endSec + 0.65) {
        rawEnd = isl.endSec;
        break;
      }
    }

    if (aligned.length > 0) {
      const prev = aligned[aligned.length - 1];
      if (rawStart < prev.endSec + 0.02) {
        rawStart = prev.endSec + 0.02;
      }
    }
    rawEnd = Math.max(rawStart + Math.max(0.25, pl.words.length * 0.08), Math.min(safeDuration, rawEnd));

    aligned.push({
      id: `line-${i}`,
      text: pl.text,
      startSec: Number(rawStart.toFixed(3)),
      endSec: Number(rawEnd.toFixed(3)),
      stanzaBreakBefore: pl.stanzaBreakBefore,
      frameIndex: 0,
      words: distributeWordsInLine(i, pl.words, rawStart, rawEnd, rmsEnvelope, rmsHz),
    });
  }

  assignFramesToLines(aligned, linesPerFrame);
  return aligned;
}

function normalizeTokenForMatch(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || isCjkOrKana(code);
    })
    .join('');
}

function tokenSimilarity(a: string, b: string): number {
  const na = normalizeTokenForMatch(a);
  const nb = normalizeTokenForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1.0;
  if (na.startsWith(nb) || nb.startsWith(na)) {
    return (Math.min(na.length, nb.length) / Math.max(na.length, nb.length)) * 0.9;
  }
  let matches = 0;
  const minLen = Math.min(na.length, nb.length);
  for (let i = 0; i < minLen; i++) {
    if (na[i] === nb[i]) matches++;
  }
  return matches / Math.max(na.length, nb.length);
}

/**
 * Aligns pasted lyrics against Whisper word-level timestamps using Needleman-Wunsch DP,
 * interpolating any unmatched words with the vocal energy envelope.
 */
export function alignLyricsWithWhisperWords(
  rawLyrics: string,
  whisperWords: WhisperWordInput[],
  durationSec: number,
  rmsEnvelope: Float32Array | null,
  rmsHz: number,
  linesPerFrame = 4
): AlignedLyricLine[] {
  const parsedLines = parseRawLyrics(rawLyrics);
  if (parsedLines.length === 0) return [];
  if (whisperWords.length < 3) {
    return alignLyricsWithWaveform(rawLyrics, durationSec, rmsEnvelope, rmsHz, linesPerFrame);
  }

  // Flatten lyric words
  const flatTokens: { lineIdx: number; wordIdx: number; text: string }[] = [];
  parsedLines.forEach((pl, lIdx) => {
    pl.words.forEach((w, wIdx) => {
      flatTokens.push({ lineIdx: lIdx, wordIdx: wIdx, text: w });
    });
  });

  const N = flatTokens.length;
  const M = whisperWords.length;

  // DP matrix for sequence alignment
  const gapPenalty = -0.35;
  const dp = new Float32Array((N + 1) * (M + 1));
  const trace = new Uint8Array((N + 1) * (M + 1)); // 1 = diag, 2 = up (skip lyric), 3 = left (skip whisper)

  for (let i = 1; i <= N; i++) {
    dp[i * (M + 1)] = i * gapPenalty;
    trace[i * (M + 1)] = 2;
  }
  for (let j = 1; j <= M; j++) {
    dp[j] = j * gapPenalty;
    trace[j] = 3;
  }

  for (let i = 1; i <= N; i++) {
    const lWord = flatTokens[i - 1].text;
    for (let j = 1; j <= M; j++) {
      const sim = tokenSimilarity(lWord, whisperWords[j - 1].word);
      const matchScore = sim >= 0.45 ? sim * 1.6 : -0.4;

      const diag = dp[(i - 1) * (M + 1) + (j - 1)] + matchScore;
      const up = dp[(i - 1) * (M + 1) + j] + gapPenalty;
      const left = dp[i * (M + 1) + (j - 1)] + gapPenalty;

      const idx = i * (M + 1) + j;
      if (diag >= up && diag >= left) {
        dp[idx] = diag;
        trace[idx] = 1;
      } else if (up >= left) {
        dp[idx] = up;
        trace[idx] = 2;
      } else {
        dp[idx] = left;
        trace[idx] = 3;
      }
    }
  }

  const matchedWhisperIdx = new Int32Array(N).fill(-1);
  let ci = N;
  let cj = M;
  let matchCount = 0;

  while (ci > 0 && cj > 0) {
    const dir = trace[ci * (M + 1) + cj];
    if (dir === 1) {
      const sim = tokenSimilarity(flatTokens[ci - 1].text, whisperWords[cj - 1].word);
      if (sim >= 0.45) {
        matchedWhisperIdx[ci - 1] = cj - 1;
        matchCount++;
      }
      ci--;
      cj--;
    } else if (dir === 2) {
      ci--;
    } else {
      cj--;
    }
  }

  // If Whisper matched fewer than 20% of words (e.g. wrong language auto-detect), use waveform aligner
  if (matchCount < Math.max(2, N * 0.2)) {
    return alignLyricsWithWaveform(rawLyrics, durationSec, rmsEnvelope, rmsHz, linesPerFrame);
  }

  // Fill in start/end for every flat token via anchor interpolation
  const wordStarts = new Float64Array(N);
  const wordEnds = new Float64Array(N);

  for (let k = 0; k < N; k++) {
    const wIdx = matchedWhisperIdx[k];
    if (wIdx >= 0) {
      wordStarts[k] = whisperWords[wIdx].start;
      wordEnds[k] = Math.max(whisperWords[wIdx].start + 0.08, whisperWords[wIdx].end);
    }
  }

  // Interpolate unmatched spans between matched anchors
  let idx = 0;
  while (idx < N) {
    if (matchedWhisperIdx[idx] >= 0) {
      idx++;
      continue;
    }
    const spanStart = idx;
    while (idx < N && matchedWhisperIdx[idx] < 0) {
      idx++;
    }
    const spanEnd = idx - 1;

    const tLeft = spanStart > 0 ? wordEnds[spanStart - 1] : Math.max(0, (whisperWords[0]?.start ?? 1) - 0.8);
    const tRight =
      idx < N
        ? Math.max(tLeft + 0.15, wordStarts[idx])
        : Math.min(durationSec, Math.max(tLeft + (spanEnd - spanStart + 1) * 0.4, whisperWords[M - 1].end + 0.5));

    const sliceWords = flatTokens.slice(spanStart, spanEnd + 1).map((t) => t.text);
    const distributed = distributeWordsInLine(0, sliceWords, tLeft, tRight, rmsEnvelope, rmsHz);
    distributed.forEach((dw, offset) => {
      wordStarts[spanStart + offset] = dw.startSec;
      wordEnds[spanStart + offset] = dw.endSec;
    });
  }

  // Reconstruct lines from flat word timestamps
  let cursor = 0;
  const aligned: AlignedLyricLine[] = parsedLines.map((pl, lIdx) => {
    const count = pl.words.length;
    const words: WordSegment[] = [];
    for (let w = 0; w < count; w++) {
      const flatIdx = cursor + w;
      words.push({
        id: `word-${lIdx}-${w}`,
        text: pl.words[w],
        startSec: Number(wordStarts[flatIdx].toFixed(3)),
        endSec: Number(wordEnds[flatIdx].toFixed(3)),
      });
    }
    cursor += count;
    const lineStart = words[0]?.startSec ?? 0;
    const lineEnd = words[words.length - 1]?.endSec ?? lineStart + 1;

    return {
      id: `line-${lIdx}`,
      text: pl.text,
      startSec: lineStart,
      endSec: lineEnd,
      stanzaBreakBefore: pl.stanzaBreakBefore,
      frameIndex: 0,
      words,
    };
  });

  assignFramesToLines(aligned, linesPerFrame);
  return aligned;
}

/**
 * Re-synchronizes word timings strictly inside each line's customized [startSec, endSec] window.
 */
export function resyncWordsWithinLines(
  lines: AlignedLyricLine[],
  rmsEnvelope: Float32Array | null,
  rmsHz: number
): AlignedLyricLine[] {
  return lines.map((line, lIdx) => {
    const rawWords = line.words.length > 0 ? line.words.map((w) => w.text) : splitLineIntoWords(line.text);
    return {
      ...line,
      words: distributeWordsInLine(lIdx, rawWords, line.startSec, line.endSec, rmsEnvelope, rmsHz),
    };
  });
}
