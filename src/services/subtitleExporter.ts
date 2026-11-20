import type { AlignedLyricLine } from './alignmentEngine';

export interface KaraokeVisualOptions {
  aspectRatio: '4:3' | '16:9';
  bgColor: string;
  textSize: number; // UI scale e.g. 32 (maps proportionally to 1080p PlayResY)
  activeColor: string;
  unsungColor: string;
  outlineColor: string;
  bold: boolean;
  outline: boolean;
  hCenter: boolean;
  vCenter: boolean;
  linesPerFrame: number;
  /** Normalized [0..1] bounding box controlled by the 4 corner circles */
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
}

const BS = String.fromCharCode(92); // Backslash character
const LF = String.fromCharCode(10); // Linefeed character

export function getResolutionDimensions(
  aspectRatio: '4:3' | '16:9',
  quality: '720p' | '1080p' = '1080p'
): { width: number; height: number } {
  if (quality === '720p') {
    return aspectRatio === '4:3' ? { width: 960, height: 720 } : { width: 1280, height: 720 };
  }
  return aspectRatio === '4:3' ? { width: 1440, height: 1080 } : { width: 1920, height: 1080 };
}

/**
 * Converts #RRGGBB hex to ASS &HAABBGGRR color format (00 = opaque).
 */
export function hexToAssColor(hex: string, alphaHex = '00'): string {
  const clean = hex.trim().replace('#', '');
  if (clean.length !== 6) return `&H${alphaHex}FFFFFF`;
  const r = clean.slice(0, 2).toUpperCase();
  const g = clean.slice(2, 4).toUpperCase();
  const b = clean.slice(4, 6).toUpperCase();
  return `&H${alphaHex}${b}${g}${r}`;
}

export function formatAssTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const totalCs = Math.round(clamped * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function formatLrcTimestamp(sec: number): string {
  const clamped = Math.max(0, sec);
  const totalCs = Math.round(clamped * 100);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export interface FrameGroup {
  frameIndex: number;
  lines: AlignedLyricLine[];
  startSec: number;
  endSec: number;
  displayStartSec: number;
  displayEndSec: number;
  isBreak?: boolean;
}

export interface ScheduledKaraokeLine {
  id: string;
  line: AlignedLyricLine;
  slotIndex: number;
  actualCount: number;
  totalSlots: number;
  displayStartSec: number;
  displayEndSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  isBreak?: boolean;
}

export interface TitleCardWindow {
  startSec: number;
  endSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface KaraokePresentationTimeline {
  groups: FrameGroup[];
  scheduledLines: ScheduledKaraokeLine[];
  introCard: TitleCardWindow | null;
  outroCard: TitleCardWindow | null;
}

const BREAK_GAP_THRESHOLD_SEC = 8.0;
const INCOMING_LEAD_IN_SEC = 3.0;
const DEFAULT_FADE_IN_SEC = 0.25;
const DEFAULT_FADE_OUT_SEC = 0.3;

export function computeFadeOpacity(
  currentTimeSec: number,
  startSec: number,
  endSec: number,
  fadeInSec = DEFAULT_FADE_IN_SEC,
  fadeOutSec = DEFAULT_FADE_OUT_SEC
): number {
  if (currentTimeSec < startSec || currentTimeSec > endSec) return 0;
  if (fadeInSec > 0 && currentTimeSec < startSec + fadeInSec) {
    return Math.max(0, Math.min(1, (currentTimeSec - startSec) / fadeInSec));
  }
  if (fadeOutSec > 0 && currentTimeSec > endSec - fadeOutSec) {
    return Math.max(0, Math.min(1, (endSec - currentTimeSec) / fadeOutSec));
  }
  return 1;
}

export const OUTRO_WATERMARK_TEXT = 'github.com/hubert17/KaraoCraft';
const OUTRO_WATERMARK_LEAD_SEC = 7.0;
const OUTRO_WATERMARK_FADE_SEC = 2.0;
const OUTRO_WATERMARK_MAX_OPACITY = 0.5;

export function computeOutroWatermarkOpacity(
  currentTimeSec: number,
  outroCard: TitleCardWindow | null
): number {
  if (!outroCard) return 0;
  const wStart = Math.max(outroCard.startSec, outroCard.endSec - OUTRO_WATERMARK_LEAD_SEC);
  const wEnd = outroCard.endSec;
  if (currentTimeSec < wStart || currentTimeSec > wEnd || wEnd <= wStart) return 0;
  const span = wEnd - wStart;
  const fadeSec = Math.min(OUTRO_WATERMARK_FADE_SEC, span * 0.45);
  return Number(
    (OUTRO_WATERMARK_MAX_OPACITY * computeFadeOpacity(currentTimeSec, wStart, wEnd, fadeSec, fadeSec)).toFixed(4)
  );
}

function createBreakLine(breakIdx: number, startSec: number, endSec: number): AlignedLyricLine {
  const sweepStart = startSec + 0.25;
  const sweepEnd = Math.max(sweepStart + 0.5, endSec - 0.3);
  const span = sweepEnd - sweepStart;
  const t1 = Number((sweepStart + span * 0.38).toFixed(3));
  const t2 = Number((sweepStart + span * 0.62).toFixed(3));

  return {
    id: `break-line-${breakIdx}`,
    text: '------------ Break ------------',
    startSec: Number(sweepStart.toFixed(3)),
    endSec: Number(sweepEnd.toFixed(3)),
    stanzaBreakBefore: true,
    frameIndex: -100 - breakIdx,
    words: [
      {
        id: `break-word-${breakIdx}-0`,
        text: '------------',
        startSec: Number(sweepStart.toFixed(3)),
        endSec: t1,
      },
      {
        id: `break-word-${breakIdx}-1`,
        text: 'Break',
        startSec: t1,
        endSec: t2,
      },
      {
        id: `break-word-${breakIdx}-2`,
        text: '------------',
        startSec: t2,
        endSec: Number(sweepEnd.toFixed(3)),
      },
    ],
  };
}

export function applyLyricsOffset(lines: AlignedLyricLine[], offsetSec: number): AlignedLyricLine[] {
  if (!offsetSec || Math.abs(offsetSec) < 0.0001) return lines;
  return lines.map((line) => {
    const words = line.words.map((w) => {
      const s = Number(Math.max(0, w.startSec + offsetSec).toFixed(3));
      const e = Number(Math.max(s + 0.04, w.endSec + offsetSec).toFixed(3));
      return {
        ...w,
        startSec: s,
        endSec: e,
      };
    });
    const lineStart = words.length > 0 ? words[0].startSec : Number(Math.max(0, line.startSec + offsetSec).toFixed(3));
    const lineEnd =
      words.length > 0
        ? words[words.length - 1].endSec
        : Number(Math.max(lineStart + 0.08, line.endSec + offsetSec).toFixed(3));
    return {
      ...line,
      startSec: lineStart,
      endSec: lineEnd,
      words,
    };
  });
}

export function buildFrameGroups(lines: AlignedLyricLine[], durationSec: number): FrameGroup[] {
  if (lines.length === 0) return [];

  const map = new Map<number, AlignedLyricLine[]>();
  for (const line of lines) {
    const bucket = map.get(line.frameIndex) ?? [];
    bucket.push(line);
    map.set(line.frameIndex, bucket);
  }

  const keys = Array.from(map.keys()).sort((a, b) => a - b);
  const rawGroups: FrameGroup[] = keys.map((frameIndex) => {
    const groupLines = map.get(frameIndex)!;
    const startSec = groupLines[0].startSec;
    const endSec = groupLines[groupLines.length - 1].endSec;
    return {
      frameIndex,
      lines: groupLines,
      startSec,
      endSec,
      displayStartSec: startSec,
      displayEndSec: endSec,
    };
  });

  // Compute smooth 3.0s pre-roll and extended post-hold (~2.0s on moderate gaps)
  for (let i = 0; i < rawGroups.length; i++) {
    const cur = rawGroups[i];
    const prevEnd = i > 0 ? rawGroups[i - 1].displayEndSec : 0;
    const nextStart =
      i < rawGroups.length - 1 ? rawGroups[i + 1].startSec : Math.max(durationSec, cur.endSec + 2.5);

    const idealLeadIn = Math.max(prevEnd + 0.12, cur.startSec - INCOMING_LEAD_IN_SEC);
    cur.displayStartSec = Number(Math.min(cur.startSec, idealLeadIn).toFixed(3));

    const gapToNext = nextStart - cur.endSec;
    let hold: number;
    if (gapToNext >= BREAK_GAP_THRESHOLD_SEC) {
      // Hold for ~2.0s before fading out into the --- Break --- banner
      hold = 2.0;
    } else if (gapToNext >= INCOMING_LEAD_IN_SEC + 0.6) {
      // Enough room for the next group's 3.0s lead-in PLUS a post-hold on the current group (up to 2.2s)
      hold = Math.min(2.2, gapToNext - INCOMING_LEAD_IN_SEC - 0.15);
    } else if (gapToNext > 1.2) {
      // Tight gap (< 3.6s): brief post-hold while Slot 0 lookahead previews the incoming line 3.0s early
      hold = Math.min(0.65, gapToNext * 0.35);
    } else {
      hold = Math.max(0.08, gapToNext * 0.45);
    }

    cur.displayEndSec = Number(Math.min(nextStart - 0.08, cur.endSec + hold).toFixed(3));
    if (cur.displayEndSec <= cur.endSec) {
      cur.displayEndSec = Number((cur.endSec + 0.05).toFixed(3));
    }
  }

  // Insert automatic --- Break --- groups whenever gap between groups >= BREAK_GAP_THRESHOLD_SEC (8.0s)
  const finalGroups: FrameGroup[] = [];
  let breakCounter = 0;

  for (let i = 0; i < rawGroups.length; i++) {
    const cur = rawGroups[i];
    finalGroups.push(cur);

    if (i < rawGroups.length - 1) {
      const next = rawGroups[i + 1];
      const rawGap = next.startSec - cur.endSec;
      if (rawGap >= BREAK_GAP_THRESHOLD_SEC) {
        const breakStart = Number((cur.displayEndSec + 0.35).toFixed(3));
        const breakEnd = Number((next.displayStartSec - 0.35).toFixed(3));
        if (breakEnd - breakStart >= 2.0) {
          const bLine = createBreakLine(breakCounter, breakStart, breakEnd);
          finalGroups.push({
            frameIndex: bLine.frameIndex,
            lines: [bLine],
            startSec: bLine.startSec,
            endSec: bLine.endSec,
            displayStartSec: breakStart,
            displayEndSec: breakEnd,
            isBreak: true,
          });
          breakCounter++;
        }
      }
    }
  }

  return finalGroups;
}

export function buildKaraokePresentationTimeline(params: {
  lines: AlignedLyricLine[];
  durationSec: number;
  linesPerFrame: number;
  title?: string;
  artist?: string;
}): KaraokePresentationTimeline {
  const { lines, durationSec, linesPerFrame, title = '', artist = '' } = params;
  const groups = buildFrameGroups(lines, durationSec);
  const slotCapacity = Math.max(1, linesPerFrame);
  const hasMetadata = Boolean(title.trim() || artist.trim());

  // 1. Intro Title & Artist Card (starts immediately at frame 0 with no fade-in)
  let introCard: TitleCardWindow | null = null;
  const firstFrameDisplayStart = groups[0]?.displayStartSec ?? 4.0;
  if (hasMetadata && firstFrameDisplayStart >= 1.2) {
    const introStart = 0;
    const introEnd = Number(Math.max(1.0, Math.min(firstFrameDisplayStart - 0.4, 11.0)).toFixed(3));
    if (introEnd > introStart + 0.6) {
      introCard = {
        startSec: introStart,
        endSec: introEnd,
        fadeInSec: 0,
        fadeOutSec: 0.35,
      };
    }
  }

  // 2. Build per-line scheduled display windows with 3.0-Second Lookahead Rule:
  // Every incoming lyric group (or its Slot 0 lookahead line when the gap is < 3.0s) appears 3.0 seconds
  // before the start of that incoming lyric (`next.startSec - 3.0`).
  const lookaheadSwapTimeForGroup = new Map<number, number>();
  for (let i = 0; i < groups.length - 1; i++) {
    const cur = groups[i];
    const next = groups[i + 1];
    if (cur.isBreak || next.isBreak) continue;
    if (cur.lines.length < 2 || next.lines.length === 0) continue;

    const targetLookaheadSec = next.startSec - INCOMING_LEAD_IN_SEC;
    // If 3.0s before next.startSec falls while cur is still on screen, swap Slot 0 at next.startSec - 3.0s
    if (targetLookaheadSec < next.displayStartSec - 0.1) {
      const firstLineEnd = cur.lines[0].endSec;
      const swapSec = Number(Math.max(firstLineEnd + 0.35, targetLookaheadSec).toFixed(3));
      if (swapSec < cur.displayEndSec - 0.15 && swapSec < next.displayStartSec - 0.1) {
        lookaheadSwapTimeForGroup.set(i, swapSec);
      }
    }
  }

  const scheduledLines: ScheduledKaraokeLine[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const totalSlots = group.isBreak ? 1 : Math.max(slotCapacity, group.lines.length);
    const earlySwapOutSec = lookaheadSwapTimeForGroup.get(i);
    const earlySwapInSec = i > 0 ? lookaheadSwapTimeForGroup.get(i - 1) : undefined;

    group.lines.forEach((line, idxInGroup) => {
      let lineStart = group.displayStartSec;
      let lineEnd = group.displayEndSec;

      // If this is Line 0 of group i and group i-1 swapped it in early via lookahead:
      if (idxInGroup === 0 && earlySwapInSec !== undefined) {
        lineStart = earlySwapInSec;
      }

      // If this is Line 0 of group i and it swaps out early to show group i+1's first line:
      // Strictly cap at earlySwapOutSec - 0.05 so it NEVER overlaps the incoming lookahead line.
      if (idxInGroup === 0 && earlySwapOutSec !== undefined) {
        lineEnd = Number((earlySwapOutSec - 0.05).toFixed(3));
      }

      scheduledLines.push({
        id: `${group.frameIndex}-${line.id}`,
        line,
        slotIndex: idxInGroup,
        actualCount: group.lines.length,
        totalSlots,
        displayStartSec: lineStart,
        displayEndSec: lineEnd,
        fadeInSec: DEFAULT_FADE_IN_SEC,
        fadeOutSec: DEFAULT_FADE_OUT_SEC,
        isBreak: group.isBreak,
      });
    });
  }

  // 3. Outro Title & Artist Card (auto-sized after final lyric frame fades out, leaving 3s at end for background fade-out)
  let outroCard: TitleCardWindow | null = null;
  const lastGroup = groups[groups.length - 1];
  if (hasMetadata && lastGroup && durationSec - lastGroup.displayEndSec >= 2.5) {
    const outroStart = Number((lastGroup.displayEndSec + 0.5).toFixed(3));
    const minOutroEnd = Math.max(outroStart + 1.8, lastGroup.endSec + 3.0);
    const reservedTailEnd = durationSec - 3.1;
    const rawOutroEnd =
      reservedTailEnd >= minOutroEnd
        ? reservedTailEnd
        : Math.max(outroStart + 1.5, durationSec - 0.3);
    const outroEnd = Number(Math.min(durationSec - 0.2, rawOutroEnd).toFixed(3));
    if (outroEnd > outroStart + 1.0) {
      outroCard = {
        startSec: outroStart,
        endSec: outroEnd,
        fadeInSec: 0.35,
        fadeOutSec: 0.4,
      };
    }
  }

  return {
    groups,
    scheduledLines,
    introCard,
    outroCard,
  };
}

export interface BackgroundOpacityRamp {
  startSec: number;
  endSec: number;
  fromOpacity: number;
  toOpacity: number;
}

const BG_LYRIC_OPACITY = 0.4;
const BG_FULL_OPACITY = 1.0;
const BG_RAMP_DOWN_BEFORE_LYRICS_SEC = 5.0;
const BG_RAMP_UP_BEFORE_END_SEC = 2.0;
const BG_RAMP_UP_AFTER_END_SEC = 3.0;
const BG_OUTRO_FADEOUT_SEC = 3.0;

/**
 * Builds the chronological opacity transition ramps for the optional background image:
 * - Starts at 100% (1.0) in Intro (no fade-in).
 * - 5s before first lyrics group starts sweeping -> transitions linearly to 40% (0.40), hitting exact 0.40 at firstLyricStart.
 * - For each long break (gap >= 8.0s):
 *   - 2s before last word finishes sweeping (`cur.endSec - 2.0`) -> transitions to 100% (1.0) at 3s after last word (`cur.endSec + 3.0`).
 *   - 5s before next lyrics group starts sweeping (`next.startSec - 5.0`) -> transitions back to 40% (0.40) at `next.startSec`.
 * - For Outro:
 *   - 2s before final word finishes sweeping (`last.endSec - 2.0`) -> transitions to 100% (1.0) at 3s after last word (`last.endSec + 3.0`).
 *   - Right after Outro Title/Artist card fades out (`outroCard.endSec`), fades out over 3s (`1.0 -> 0.0`).
 */
export function buildBackgroundOpacityRamps(
  timeline: KaraokePresentationTimeline,
  durationSec: number
): BackgroundOpacityRamp[] {
  const lyricGroups = timeline.groups.filter((g) => !g.isBreak);
  if (lyricGroups.length === 0) return [];

  const ramps: BackgroundOpacityRamp[] = [];

  // 1. Intro -> First Lyrics Group (100% -> 30%)
  const firstGroup = lyricGroups[0];
  const firstStart = Math.max(0, firstGroup.startSec);
  const introRampStart = Math.max(0, firstStart - BG_RAMP_DOWN_BEFORE_LYRICS_SEC);
  ramps.push({
    startSec: Number(introRampStart.toFixed(3)),
    endSec: Number(firstStart.toFixed(3)),
    fromOpacity: BG_FULL_OPACITY,
    toOpacity: BG_LYRIC_OPACITY,
  });

  // 2. Long Breaks between consecutive lyric groups (30% -> 100% -> 30%)
  for (let i = 0; i < lyricGroups.length - 1; i++) {
    const cur = lyricGroups[i];
    const next = lyricGroups[i + 1];
    const rawGap = next.startSec - cur.endSec;
    if (rawGap >= BREAK_GAP_THRESHOLD_SEC) {
      const upStart = Math.max(cur.startSec, cur.endSec - BG_RAMP_UP_BEFORE_END_SEC);
      const upEnd = cur.endSec + BG_RAMP_UP_AFTER_END_SEC;
      const downStart = Math.max(upEnd, next.startSec - BG_RAMP_DOWN_BEFORE_LYRICS_SEC);
      const downEnd = next.startSec;

      ramps.push({
        startSec: Number(upStart.toFixed(3)),
        endSec: Number(upEnd.toFixed(3)),
        fromOpacity: BG_LYRIC_OPACITY,
        toOpacity: BG_FULL_OPACITY,
      });
      ramps.push({
        startSec: Number(downStart.toFixed(3)),
        endSec: Number(downEnd.toFixed(3)),
        fromOpacity: BG_FULL_OPACITY,
        toOpacity: BG_LYRIC_OPACITY,
      });
    }
  }

  // 3. Outro (30% -> 100%, then 3s fade-out 100% -> 0% right after Outro Title/Artist fades)
  const lastGroup = lyricGroups[lyricGroups.length - 1];
  const outroUpStart = Math.max(lastGroup.startSec, lastGroup.endSec - BG_RAMP_UP_BEFORE_END_SEC);
  const outroUpEnd = lastGroup.endSec + BG_RAMP_UP_AFTER_END_SEC;
  ramps.push({
    startSec: Number(outroUpStart.toFixed(3)),
    endSec: Number(outroUpEnd.toFixed(3)),
    fromOpacity: BG_LYRIC_OPACITY,
    toOpacity: BG_FULL_OPACITY,
  });

  const fadeOutStart = timeline.outroCard
    ? Math.max(outroUpEnd, timeline.outroCard.endSec)
    : Math.max(outroUpEnd, durationSec - BG_OUTRO_FADEOUT_SEC);
  const fadeOutEnd = fadeOutStart + BG_OUTRO_FADEOUT_SEC;

  ramps.push({
    startSec: Number(fadeOutStart.toFixed(3)),
    endSec: Number(fadeOutEnd.toFixed(3)),
    fromOpacity: BG_FULL_OPACITY,
    toOpacity: 0.0,
  });

  return ramps;
}

export function computeBackgroundImageOpacity(
  currentTimeSec: number,
  timeline: KaraokePresentationTimeline,
  durationSec: number
): number {
  const ramps = buildBackgroundOpacityRamps(timeline, durationSec);
  if (ramps.length === 0) return BG_FULL_OPACITY;

  const t = Math.max(0, currentTimeSec);
  if (t < ramps[0].startSec) {
    return ramps[0].fromOpacity;
  }

  for (const r of ramps) {
    if (t < r.startSec) {
      return r.fromOpacity;
    }
    if (t >= r.startSec && t <= r.endSec) {
      if (r.endSec <= r.startSec) return r.toOpacity;
      const progress = (t - r.startSec) / (r.endSec - r.startSec);
      const val = r.fromOpacity + progress * (r.toOpacity - r.fromOpacity);
      return Number(Math.max(0, Math.min(1, val)).toFixed(4));
    }
  }

  return ramps[ramps.length - 1].toOpacity;
}

/**
 * Generates an ASS v4.00+ karaoke script matching the interactive Options preview stage
 * (aspect ratio, 4-corner bounding box position & line spacing, font size, outline, bold, and \kf sweeps).
 */
export function generateAssSubtitle(params: {
  title: string;
  artist: string;
  lines: AlignedLyricLine[];
  options: KaraokeVisualOptions;
  durationSec: number;
  quality?: '720p' | '1080p';
  hasBackgroundImage?: boolean;
}): string {
  const {
    title,
    artist,
    lines,
    options,
    durationSec,
    quality = '1080p',
    hasBackgroundImage = false,
  } = params;
  const { width: playResX, height: playResY } = getResolutionDimensions(options.aspectRatio, quality);
  const scaleFactor = playResY / 1080;

  // UI textSize 32 corresponds to ~68px at 1080p
  const fontSizePx = Math.round(options.textSize * 2.12 * scaleFactor);
  const outlinePx = options.outline ? Number((Math.max(2.5, fontSizePx * 0.075)).toFixed(1)) : 0;
  const boldFlag = options.bold ? -1 : 0;

  const primaryAss = hexToAssColor(options.activeColor, '00');
  const secondaryAss = hexToAssColor(options.unsungColor, '00');
  const outlineAss = hexToAssColor(options.outlineColor, '00');
  const backAss = hexToAssColor('#000000', '80');
  const bgSolidAss = hexToAssColor(options.bgColor, '00');

  const marginL = Math.max(20, Math.round(options.boxLeft * playResX));
  const marginR = Math.max(20, Math.round((1 - (options.boxLeft + options.boxWidth)) * playResX));

  const styles: string[] = [
    `Style: Karaoke,Helvetica Neue,${fontSizePx},${primaryAss},${secondaryAss},${outlineAss},${backAss},${boldFlag},0,0,0,100,100,0,0,1,${outlinePx},0,5,${marginL},${marginR},20,1`,
    `Style: TitleCard,Helvetica Neue,${Math.round(fontSizePx * 1.18)},${secondaryAss},${secondaryAss},${outlineAss},${backAss},-1,0,0,0,100,100,0,0,1,${outlinePx},0,5,60,60,20,1`,
    `Style: ArtistCard,Helvetica Neue,${Math.round(fontSizePx * 0.78)},${primaryAss},${primaryAss},${outlineAss},${backAss},${boldFlag},0,0,0,100,100,0,0,1,${Math.max(0, Number((outlinePx * 0.8).toFixed(1)))},0,5,60,60,20,1`,
    `Style: IntroStaff,Helvetica Neue,20,&H1CFFF6EB,&H1CFFF6EB,${hexToAssColor(options.outlineColor, '40')},&H80000000,0,0,0,0,100,100,0,0,1,1.8,0,7,0,0,0,1`,
    `Style: IntroClef,Apple Symbols,${Math.round(fontSizePx * 1.85)},&H08FFF9F2,&H08FFF9F2,${hexToAssColor(options.outlineColor, '38')},&H80000000,0,0,0,0,100,100,0,0,1,${Math.max(1.8, Number((outlinePx * 0.55).toFixed(1)))},0,5,40,40,20,1`,
    `Style: IntroBrand,Snell Roundhand,${Math.round(fontSizePx * 2.15)},&H08FFF9F2,&H08FFF9F2,${hexToAssColor(options.outlineColor, '38')},&H80000000,-1,0,0,0,100,100,1.5,0,1,${Math.max(2.0, Number((outlinePx * 0.65).toFixed(1)))},0,5,40,40,20,1`,
    `Style: CreditWatermark,Helvetica Neue,${Math.max(18, Math.round(fontSizePx * 0.56))},&H80FFFFFF,&H80FFFFFF,&HC0000000,&HC0000000,0,0,0,0,100,100,0,0,1,1.0,1,5,40,40,20,1`,
  ];

  if (hasBackgroundImage) {
    styles.push(
      `Style: BgDimmer,Helvetica Neue,20,${bgSolidAss},${bgSolidAss},${bgSolidAss},${bgSolidAss},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`
    );
  }

  const out: string[] = [
    '[Script Info]',
    `Title: ${title || 'Untitled Karaoke'}`,
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const timeline = buildKaraokePresentationTimeline({
    lines,
    durationSec,
    linesPerFrame: options.linesPerFrame,
    title,
    artist,
  });

  const fgLayer = hasBackgroundImage ? 1 : 0;

  // 0. Background Dimmer Layer (Layer 0) when a background image is active
  if (hasBackgroundImage) {
    const ramps = buildBackgroundOpacityRamps(timeline, durationSec);
    const lastRampEnd = ramps.length > 0 ? ramps[ramps.length - 1].endSec : durationSec;
    const totalSpanSec = Math.max(durationSec + 5.0, lastRampEnd + 2.0);
    const initOpacity =
      ramps.length > 0 && ramps[0].startSec <= 0 && ramps[0].endSec <= 0
        ? ramps[0].toOpacity
        : (ramps[0]?.fromOpacity ?? 1.0);
    const toAssAlphaHex = (imgOpacity: number) =>
      Math.round(Math.max(0, Math.min(1, imgOpacity)) * 255)
        .toString(16)
        .toUpperCase()
        .padStart(2, '0');

    const tOverrides = ramps
      .filter((r) => r.endSec > r.startSec)
      .map((r) => {
        const t1 = Math.round(r.startSec * 1000);
        const t2 = Math.round(r.endSec * 1000);
        return `${BS}t(${t1},${t2},${BS}1a&H${toAssAlphaHex(r.toOpacity)}&)`;
      })
      .join('');

    const rectPath = `m -2 -2 l ${playResX + 2} -2 l ${playResX + 2} ${playResY + 2} l -2 ${playResY + 2}`;
    out.push(
      `Dialogue: 0,0:00:00.00,${formatAssTimestamp(totalSpanSec)},BgDimmer,,0,0,0,,{${BS}an7${BS}pos(0,0)${BS}1a&H${toAssAlphaHex(initOpacity)}&${tOverrides}${BS}p1}${rectPath}{${BS}p0}`
    );
  }

  const centerX = Math.round(playResX * 0.5);

  const emitTitleArtistCard = (card: TitleCardWindow, isIntro: boolean) => {
    const fi = Math.round(card.fadeInSec * 1000);
    const fo = Math.round(card.fadeOutSec * 1000);
    const titleY = Math.round(playResY * (isIntro ? 0.41 : 0.44));
    const artistY = Math.round(playResY * (isIntro ? 0.52 : 0.56));
    const titleGlowBord = Math.max(4, Number((outlinePx + fontSizePx * 0.1).toFixed(1)));
    const artistGlowBord = Math.max(3, Number((outlinePx * 0.8 + fontSizePx * 0.08).toFixed(1)));
    if (title.trim()) {
      const safeTitle = escapeAssText(title.trim());
      out.push(
        `Dialogue: ${fgLayer},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},TitleCard,,0,0,0,,{${BS}an5${BS}pos(${centerX},${titleY})${BS}bord${titleGlowBord}${BS}blur5${BS}3a&H55&${BS}fad(${fi},${fo})}${safeTitle}`
      );
      out.push(
        `Dialogue: ${fgLayer + 1},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},TitleCard,,0,0,0,,{${BS}an5${BS}pos(${centerX},${titleY})${BS}fad(${fi},${fo})}${safeTitle}`
      );
    }
    if (artist.trim()) {
      const safeArtist = escapeAssText(artist.trim());
      out.push(
        `Dialogue: ${fgLayer},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},ArtistCard,,0,0,0,,{${BS}an5${BS}pos(${centerX},${artistY})${BS}bord${artistGlowBord}${BS}blur5${BS}3a&H55&${BS}fad(${fi},${fo})}${safeArtist}`
      );
      out.push(
        `Dialogue: ${fgLayer + 1},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},ArtistCard,,0,0,0,,{${BS}an5${BS}pos(${centerX},${artistY})${BS}fad(${fi},${fo})}${safeArtist}`
      );
    }

    if (isIntro) {
      // 5-Line Musical Staff (Pentagram) + Treble Clef + Glowing Script "KaraoCraft" Banner
      const staffLeft = Math.round(playResX * 0.12);
      const staffRight = Math.round(playResX * 0.88);
      const staffCenterY = Math.round(playResY * 0.72);
      const staffTotalH = Math.round(fontSizePx * 2.15);
      const staffStep = Math.max(12, Math.round(staffTotalH / 4));
      const lineHalfH = Math.max(2, Math.round(fontSizePx * 0.042));
      const staffShapes: string[] = [];
      for (let s = -2; s <= 2; s++) {
        const sy = staffCenterY + s * staffStep;
        staffShapes.push(
          `m ${staffLeft} ${sy - lineHalfH} l ${staffRight} ${sy - lineHalfH} l ${staffRight} ${sy + lineHalfH} l ${staffLeft} ${sy + lineHalfH}`
        );
      }
      out.push(
        `Dialogue: ${fgLayer},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},IntroStaff,,0,0,0,,{${BS}an7${BS}pos(0,0)${BS}blur2.2${BS}fad(${fi},${fo})${BS}p1}${staffShapes.join(' ')}{${BS}p0}`
      );

      const clefOffset = Math.round(fontSizePx * 4.1);
      const clefX = Math.max(staffLeft + 24, centerX - clefOffset);
      const brandX = Math.round(centerX + fontSizePx * 0.45);
      const brandY = staffCenterY + Math.round(playResY * 0.005);
      const glowBorder = Math.max(5, Math.round(fontSizePx * 0.14));

      // Soft outer glow halo layer (cached static glyph in libass -> zero performance cost)
      out.push(
        `Dialogue: ${fgLayer + 1},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},IntroClef,,0,0,0,,{${BS}an5${BS}pos(${clefX},${staffCenterY})${BS}bord${glowBorder}${BS}blur6${BS}3c${hexToAssColor(options.activeColor, '')}${BS}3a&H45&${BS}fad(${fi},${fo})}𝄞`
      );
      out.push(
        `Dialogue: ${fgLayer + 1},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},IntroBrand,,0,0,0,,{${BS}an5${BS}pos(${brandX},${brandY})${BS}bord${glowBorder}${BS}blur6${BS}3c${hexToAssColor(options.activeColor, '')}${BS}3a&H45&${BS}fad(${fi},${fo})}KaraoCraft`
      );

      // Crisp foreground core layer
      out.push(
        `Dialogue: ${fgLayer + 2},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},IntroClef,,0,0,0,,{${BS}an5${BS}pos(${clefX},${staffCenterY})${BS}blur1.2${BS}fad(${fi},${fo})}𝄞`
      );
      out.push(
        `Dialogue: ${fgLayer + 2},${formatAssTimestamp(card.startSec)},${formatAssTimestamp(card.endSec)},IntroBrand,,0,0,0,,{${BS}an5${BS}pos(${brandX},${brandY})${BS}blur1.2${BS}fad(${fi},${fo})}KaraoCraft`
      );
    }
  };

  // 1. Intro Title & Artist Card
  if (timeline.introCard) {
    emitTitleArtistCard(timeline.introCard, true);
  }

  // 2. Scheduled Karaoke Lines (including Rolling Slot Lookahead & --- Break --- banners)
  const boxCenterX = Math.round((options.boxLeft + options.boxWidth * 0.5) * playResX);
  const boxTopPx = options.boxTop * playResY;
  const boxHeightPx = options.boxHeight * playResY;

  for (const item of timeline.scheduledLines) {
    // Use fixed slot grid (0..totalSlots-1) for lyric lines so Slot 0 is always at the exact same Y coordinate
    // across 2-line, 3-line, and 4-line stanzas and never collides with Slot 1 during lookahead.
    const normalizedSlot = item.isBreak ? 0.5 : (item.slotIndex + 0.5) / item.totalSlots;
    const lineY = Math.round(boxTopPx + normalizedSlot * boxHeightPx);
    const fadeInMs = Math.round(item.fadeInSec * 1000);
    const fadeOutMs = Math.round(item.fadeOutSec * 1000);

    let cursorSec = item.displayStartSec;
    const chunks: string[] = [
      `{${BS}an5${BS}pos(${boxCenterX},${lineY})${BS}fad(${fadeInMs},${fadeOutMs})}`,
    ];

    item.line.words.forEach((word, wIdx) => {
      const gapSec = word.startSec - cursorSec;
      if (gapSec > 0.01) {
        const gapCs = Math.max(1, Math.round(gapSec * 100));
        chunks.push(`{${BS}k${gapCs}}`);
        cursorSec += gapCs / 100;
      }
      const durCs = Math.max(1, Math.round((word.endSec - Math.max(cursorSec, word.startSec)) * 100));
      const suffix = wIdx < item.line.words.length - 1 ? ' ' : '';
      chunks.push(`{${BS}kf${durCs}}${escapeAssText(word.text)}${suffix}`);
      cursorSec = word.endSec;
    });

    out.push(
      `Dialogue: ${fgLayer},${formatAssTimestamp(item.displayStartSec)},${formatAssTimestamp(item.displayEndSec)},Karaoke,,${marginL},${marginR},0,,${chunks.join('')}`
    );
  }

  // 3. Outro Title & Artist Card + Subtle Bottom Credit Watermark (5s before Outro fade-out, 2s in / 2s out at 50% opacity)
  if (timeline.outroCard) {
    emitTitleArtistCard(timeline.outroCard, false);
    const wStart = Number(
      Math.max(timeline.outroCard.startSec, timeline.outroCard.endSec - OUTRO_WATERMARK_LEAD_SEC).toFixed(3)
    );
    const wEnd = timeline.outroCard.endSec;
    if (wEnd > wStart + 0.4) {
      const wSpan = wEnd - wStart;
      const wFadeMs = Math.round(Math.min(OUTRO_WATERMARK_FADE_SEC, wSpan * 0.45) * 1000);
      const creditY = Math.round(playResY * 0.92);
      out.push(
        `Dialogue: ${fgLayer},${formatAssTimestamp(wStart)},${formatAssTimestamp(wEnd)},CreditWatermark,,0,0,0,,{${BS}an5${BS}pos(${centerX},${creditY})${BS}fad(${wFadeMs},${wFadeMs})}${OUTRO_WATERMARK_TEXT}`
      );
    }
  }

  return out.join(LF) + LF;
}

function escapeAssText(text: string): string {
  return text.split('{').join('(').split('}').join(')');
}

/**
 * Generates Enhanced LRC (.lrc) with both line and word-level <mm:ss.xx> karaoke tags.
 */
export function generateEnhancedLrc(params: {
  title: string;
  artist: string;
  lines: AlignedLyricLine[];
}): string {
  const { title, artist, lines } = params;
  const out: string[] = [
    `[ti:${title || 'Untitled'}]`,
    `[ar:${artist || 'Unknown Artist'}]`,
    '[by:KaraoCraft]',
    '',
  ];

  for (const line of lines) {
    if (line.stanzaBreakBefore) {
      out.push('');
    }
    const lineTag = `[${formatLrcTimestamp(line.startSec)}]`;
    const wordTags = line.words
      .map((w) => `<${formatLrcTimestamp(w.startSec)}>${w.text}`)
      .join(' ');
    out.push(`${lineTag}${wordTags}`);
  }

  return out.join(LF) + LF;
}

export function triggerBrowserDownload(filename: string, content: string | Blob, mimeType = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface KaraoCraftProjectData {
  app?: string;
  version: number;
  savedAt?: string;
  title?: string;
  artist?: string;
  rawLyrics: string;
  vocalFileName?: string;
  vocalFilePath?: string;
  instrumentalFileName?: string;
  instrumentalFilePath?: string;
  backingVocalFileName?: string;
  backingVocalFilePath?: string;
  instrumentalGainDb?: number;
  backingVocalGainDb?: number;
  melodyGuideStyle?: 'none' | 'flute' | 'synth';
  melodyGuideFileName?: string;
  melodyGuideFilePath?: string;
  melodyGuideGainDb?: number;
  bgImageFileName?: string;
  bgImageFilePath?: string;
  lyricsOffsetSec?: number;
  duration?: number;
  options?: Partial<KaraokeVisualOptions>;
  lines: AlignedLyricLine[];
}

export function parseAndValidateProjectJson(rawText: string): KaraoCraftProjectData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('Invalid JSON file: could not parse JSON syntax.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid KaraoCraft project file: root JSON value must be an object.');
  }

  const data = parsed as Record<string, unknown>;
  const hasValidVersion = typeof data.version === 'number' && data.version >= 1;
  const hasValidApp = data.app === undefined || data.app === 'KaraoCraft';
  const hasRawLyrics = typeof data.rawLyrics === 'string';
  const hasLines = Array.isArray(data.lines) && data.lines.length > 0;
  const hasOptions = data.options !== null && typeof data.options === 'object' && !Array.isArray(data.options);

  if (!hasValidVersion || !hasValidApp || !hasRawLyrics || !hasLines || !hasOptions) {
    throw new Error(
      'Invalid KaraoCraft project file: this JSON file is not a valid KaraoCraft project.'
    );
  }

  for (const item of data.lines as unknown[]) {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid KaraoCraft project file: malformed lyric line entry.');
    }
    const line = item as Record<string, unknown>;
    if (
      typeof line.text !== 'string' ||
      typeof line.startSec !== 'number' ||
      typeof line.endSec !== 'number' ||
      !Array.isArray(line.words)
    ) {
      throw new Error('Invalid KaraoCraft project file: lyric lines are missing timing or word data.');
    }
  }

  return data as unknown as KaraoCraftProjectData;
}
