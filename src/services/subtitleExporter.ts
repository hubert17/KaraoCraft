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
  const groups: FrameGroup[] = keys.map((frameIndex) => {
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

  // Compute smooth pre-roll and post-hold windows without overlapping adjacent frames
  for (let i = 0; i < groups.length; i++) {
    const cur = groups[i];
    const prevEnd = i > 0 ? groups[i - 1].displayEndSec : 0;
    const nextStart = i < groups.length - 1 ? groups[i + 1].startSec : Math.max(durationSec, cur.endSec + 1.5);

    const idealLeadIn = Math.max(prevEnd + 0.08, cur.startSec - 1.0);
    cur.displayStartSec = Math.min(cur.startSec, idealLeadIn);

    const gapToNext = nextStart - cur.endSec;
    const hold = gapToNext > 1.2 ? 0.55 : Math.max(0.05, gapToNext * 0.45);
    cur.displayEndSec = Math.min(nextStart - 0.05, cur.endSec + hold);
    if (cur.displayEndSec <= cur.endSec) {
      cur.displayEndSec = cur.endSec + 0.05;
    }
  }

  return groups;
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
}): string {
  const { title, artist, lines, options, durationSec, quality = '1080p' } = params;
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

  const marginL = Math.max(20, Math.round(options.boxLeft * playResX));
  const marginR = Math.max(20, Math.round((1 - (options.boxLeft + options.boxWidth)) * playResX));

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
    `Style: Karaoke,Helvetica Neue,${fontSizePx},${primaryAss},${secondaryAss},${outlineAss},${backAss},${boldFlag},0,0,0,100,100,0,0,1,${outlinePx},0,5,${marginL},${marginR},20,1`,
    `Style: TitleCard,Helvetica Neue,${Math.round(fontSizePx * 1.18)},${secondaryAss},${secondaryAss},${outlineAss},${backAss},-1,0,0,0,100,100,0,0,1,${outlinePx},0,5,60,60,20,1`,
    `Style: ArtistCard,Helvetica Neue,${Math.round(fontSizePx * 0.78)},${primaryAss},${primaryAss},${outlineAss},${backAss},${boldFlag},0,0,0,100,100,0,0,1,${Math.max(0, Number((outlinePx * 0.8).toFixed(1)))},0,5,60,60,20,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const groups = buildFrameGroups(lines, durationSec);

  // Add Intro Title Card if there is room before first frame
  const firstFrameDisplayStart = groups[0]?.displayStartSec ?? 4.0;
  if ((title.trim() || artist.trim()) && firstFrameDisplayStart >= 1.2) {
    const introEnd = Math.max(0.9, Math.min(firstFrameDisplayStart - 0.25, 5.0));
    const centerX = Math.round(playResX * 0.5);
    const titleY = Math.round(playResY * 0.44);
    const artistY = Math.round(playResY * 0.56);

    if (title.trim()) {
      const safeTitle = escapeAssText(title.trim());
      out.push(
        `Dialogue: 0,${formatAssTimestamp(0.15)},${formatAssTimestamp(introEnd)},TitleCard,,0,0,0,,{${BS}an5${BS}pos(${centerX},${titleY})${BS}fad(250,300)}${safeTitle}`
      );
    }
    if (artist.trim()) {
      const safeArtist = escapeAssText(artist.trim());
      out.push(
        `Dialogue: 0,${formatAssTimestamp(0.15)},${formatAssTimestamp(introEnd)},ArtistCard,,0,0,0,,{${BS}an5${BS}pos(${centerX},${artistY})${BS}fad(250,300)}${safeArtist}`
      );
    }
  }

  // Emit frame-grouped karaoke lines positioned inside the 4-corner bounding box
  const boxCenterX = Math.round((options.boxLeft + options.boxWidth * 0.5) * playResX);
  const boxTopPx = options.boxTop * playResY;
  const boxHeightPx = options.boxHeight * playResY;
  const slotCount = Math.max(1, options.linesPerFrame);

  for (const group of groups) {
    const totalSlots = Math.max(slotCount, group.lines.length);
    const actualCount = group.lines.length;
    // Center smaller stanzas nicely inside the bounding box
    const topSlotOffset = (totalSlots - actualCount) * 0.5;

    group.lines.forEach((line, idxInGroup) => {
      const normalizedSlot = (topSlotOffset + idxInGroup + 0.5) / totalSlots;
      const lineY = Math.round(boxTopPx + normalizedSlot * boxHeightPx);

      let cursorSec = group.displayStartSec;
      const chunks: string[] = [`{${BS}an5${BS}pos(${boxCenterX},${lineY})}`];

      line.words.forEach((word, wIdx) => {
        const gapSec = word.startSec - cursorSec;
        if (gapSec > 0.01) {
          const gapCs = Math.max(1, Math.round(gapSec * 100));
          chunks.push(`{${BS}k${gapCs}}`);
          cursorSec += gapCs / 100;
        }
        const durCs = Math.max(1, Math.round((word.endSec - Math.max(cursorSec, word.startSec)) * 100));
        const suffix = wIdx < line.words.length - 1 ? ' ' : '';
        chunks.push(`{${BS}kf${durCs}}${escapeAssText(word.text)}${suffix}`);
        cursorSec = word.endSec;
      });

      out.push(
        `Dialogue: 0,${formatAssTimestamp(group.displayStartSec)},${formatAssTimestamp(group.displayEndSec)},Karaoke,,${marginL},${marginR},0,,${chunks.join('')}`
      );
    });
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
