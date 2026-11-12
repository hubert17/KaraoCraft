<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { Play, Pause, Minus, Plus, Undo2, Hand } from '@lucide/vue';

const props = defineProps<{
  mode: 'line' | 'word';
}>();

const project = useProjectStore();

const lyricScrollRef = ref<HTMLDivElement | null>(null);
const timelineWrapRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const viewportWidth = ref(900);
const canvasHeight = 185;

// Zoom in pixels per second (Line mode defaults wider view; Word mode defaults zoomed-in)
const pixelsPerSec = ref(props.mode === 'line' ? 95 : 190);
const viewStartSec = ref(0);

// Interactive drag state
const activeDragInfo = ref<string | null>(null);
const hoverBoundaryCursor = ref(false);
let isManualPanning = false;

interface TimelineItem {
  key: string;
  label: string;
  lineIdx: number;
  wordIdx: number; // -1 in line mode
  startSec: number;
  endSec: number;
  isSelected: boolean;
  isPlayingNow: boolean;
}

const viewSpanSec = computed(() => {
  return viewportWidth.value / Math.max(20, pixelsPerSec.value);
});

const viewEndSec = computed(() => {
  return viewStartSec.value + viewSpanSec.value;
});

const maxViewStartSec = computed(() => {
  const total = Math.max(10, project.duration || 180);
  return Math.max(0, total - viewSpanSec.value * 0.65);
});

function clampViewStart(sec: number): number {
  return Math.max(0, Math.min(maxViewStartSec.value, sec));
}

// Flatten items for current mode
const allItems = computed<TimelineItem[]>(() => {
  const t = project.currentTime;
  if (props.mode === 'line') {
    return project.lines.map((line, lIdx) => ({
      key: line.id,
      label: line.text,
      lineIdx: lIdx,
      wordIdx: -1,
      startSec: line.startSec,
      endSec: line.endSec,
      isSelected: project.selectedLineIndex === lIdx,
      isPlayingNow: t >= line.startSec && t <= line.endSec,
    }));
  }

  const out: TimelineItem[] = [];
  project.lines.forEach((line, lIdx) => {
    line.words.forEach((word, wIdx) => {
      out.push({
        key: word.id,
        label: word.text,
        lineIdx: lIdx,
        wordIdx: wIdx,
        startSec: word.startSec,
        endSec: word.endSec,
        isSelected: project.selectedWordId === word.id,
        isPlayingNow: t >= word.startSec && t <= word.endSec,
      });
    });
  });
  return out;
});

// Only render capsules overlapping [viewStartSec, viewEndSec] for 60fps DOM performance
const visibleItems = computed(() => {
  const left = viewStartSec.value - 2;
  const right = viewEndSec.value + 2;
  return allItems.value.filter((it) => it.endSec >= left && it.startSec <= right);
});

function timeToX(sec: number): number {
  return (sec - viewStartSec.value) * pixelsPerSec.value;
}

function xToTime(x: number): number {
  return viewStartSec.value + x / pixelsPerSec.value;
}

function formatClock(sec: number): string {
  const clamped = Math.max(0, sec || 0);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const tenths = Math.floor((clamped % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

function centerViewportAround(targetSec: number) {
  viewStartSec.value = clampViewStart(targetSec - viewSpanSec.value * 0.32);
}

// Keep zoom crisp when switching between Line Timings and Word Timings
watch(
  () => props.mode,
  (newMode) => {
    const anchorTime = project.currentTime > 0.1
      ? project.currentTime
      : project.lines[project.selectedLineIndex]?.startSec ?? 0;
    pixelsPerSec.value = newMode === 'line' ? 95 : 195;
    nextTick(() => {
      centerViewportAround(anchorTime);
      drawWaveform();
    });
  }
);

// Auto-follow playhead while audio is playing
watch(
  () => project.currentTime,
  (t) => {
    if (project.isPlaying && !isManualPanning && !activeDragInfo.value) {
      const playheadX = timeToX(t);
      if (playheadX > viewportWidth.value * 0.82 || playheadX < 0) {
        viewStartSec.value = clampViewStart(t - viewSpanSec.value * 0.18);
      }
      // Keep lyric scrollbox following active line
      const activeIdx = project.activeLineIndexAtPlayhead;
      if (activeIdx >= 0) {
        scrollLyricRowIntoView(activeIdx);
      }
    }
    drawWaveform();
  }
);

watch([viewStartSec, pixelsPerSec, viewportWidth, () => project.lines, () => project.waveformPeaks], () => {
  drawWaveform();
}, { deep: true });

function scrollLyricRowIntoView(lineIdx: number) {
  if (!lyricScrollRef.value) return;
  const rowEl = lyricScrollRef.value.querySelector(`[data-line-row="${lineIdx}"]`) as HTMLElement | null;
  if (!rowEl) return;
  const container = lyricScrollRef.value;
  const rowTop = rowEl.offsetTop;
  const rowBottom = rowTop + rowEl.offsetHeight;
  if (rowTop < container.scrollTop + 24 || rowBottom > container.scrollTop + container.clientHeight - 24) {
    container.scrollTo({
      top: Math.max(0, rowTop - container.clientHeight * 0.38),
      behavior: 'smooth',
    });
  }
}

function selectLineFromList(lineIdx: number) {
  project.selectedLineIndex = lineIdx;
  const line = project.lines[lineIdx];
  if (!line) return;
  if (line.words[0]) {
    project.selectedWordId = line.words[0].id;
  }
  project.seekAudio(line.startSec);
  centerViewportAround(line.startSec);
}

function selectWordFromList(lineIdx: number, wordIdx: number) {
  project.selectedLineIndex = lineIdx;
  const word = project.lines[lineIdx]?.words[wordIdx];
  if (!word) return;
  project.selectedWordId = word.id;
  project.seekAudio(word.startSec);
  centerViewportAround(word.startSec);
}

function zoomBy(factor: number) {
  const centerTime = xToTime(viewportWidth.value * 0.45);
  const nextPps = Math.max(35, Math.min(480, Math.round(pixelsPerSec.value * factor)));
  pixelsPerSec.value = nextPps;
  viewStartSec.value = clampViewStart(centerTime - (viewportWidth.value * 0.45) / nextPps);
}

// Capsule Dragging (Left Edge, Right Edge, or Move Whole Capsule)
function startItemDrag(
  item: TimelineItem,
  dragKind: 'start' | 'end' | 'move',
  e: PointerEvent
) {
  e.preventDefault();
  e.stopPropagation();

  project.selectedLineIndex = item.lineIdx;
  if (item.wordIdx >= 0) {
    project.selectedWordId = item.key;
  }

  project.pushUndoSnapshot();
  const startX = e.clientX;
  const origStart = item.startSec;
  const origEnd = item.endSec;
  let moved = false;

  const updateReadout = (s: number, end: number) => {
    activeDragInfo.value = `${item.label}: ${s.toFixed(2)}s → ${end.toFixed(2)}s`;
  };
  updateReadout(origStart, origEnd);

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    if (Math.abs(dx) > 2) moved = true;
    const dt = dx / pixelsPerSec.value;

    let nextS = origStart;
    let nextE = origEnd;

    if (dragKind === 'start') {
      nextS = origStart + dt;
    } else if (dragKind === 'end') {
      nextE = origEnd + dt;
    } else {
      nextS = origStart + dt;
      nextE = origEnd + dt;
    }

    if (props.mode === 'line') {
      project.updateLineTiming(item.lineIdx, nextS, nextE);
      const updated = project.lines[item.lineIdx];
      if (updated) updateReadout(updated.startSec, updated.endSec);
    } else {
      project.updateWordTiming(item.lineIdx, item.wordIdx, nextS, nextE);
      const updated = project.lines[item.lineIdx]?.words[item.wordIdx];
      if (updated) updateReadout(updated.startSec, updated.endSec);
    }
  };

  const onUp = () => {
    activeDragInfo.value = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!moved) {
      // Simple click on capsule seeks to its start!
      project.seekAudio(origStart);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

// Find if pointer on waveform is hovering near an item's start/end boundary line (±6px)
function findBoundaryHitAtX(localX: number): { item: TimelineItem; edge: 'start' | 'end' } | null {
  const tolerancePx = 6;
  for (const it of visibleItems.value) {
    const sx = timeToX(it.startSec);
    if (Math.abs(localX - sx) <= tolerancePx) {
      return { item: it, edge: 'start' };
    }
    const ex = timeToX(it.endSec);
    if (Math.abs(localX - ex) <= tolerancePx) {
      return { item: it, edge: 'end' };
    }
  }
  return null;
}

function onCanvasPointerMove(e: PointerEvent) {
  if (!canvasRef.value || activeDragInfo.value || isManualPanning) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  hoverBoundaryCursor.value = Boolean(findBoundaryHitAtX(localX));
}

function onCanvasPointerDown(e: PointerEvent) {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  const localX = e.clientX - rect.left;

  // 1. Check if grabbing a segment boundary directly on the waveform
  const hit = findBoundaryHitAtX(localX);
  if (hit) {
    startItemDrag(hit.item, hit.edge, e);
    return;
  }

  // 2. Otherwise click-to-seek OR drag-to-pan the waveform
  e.preventDefault();
  isManualPanning = true;
  const downX = e.clientX;
  const initViewStart = viewStartSec.value;
  let dragged = false;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - downX;
    if (Math.abs(dx) > 4) {
      dragged = true;
      viewStartSec.value = clampViewStart(initViewStart - dx / pixelsPerSec.value);
    }
  };

  const onUp = (ev: PointerEvent) => {
    isManualPanning = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (!dragged) {
      const clickX = ev.clientX - rect.left;
      const targetSec = Math.max(0, Math.min(project.duration || 0, xToTime(clickX)));
      project.seekAudio(targetSec);
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function onTimelineWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.15 : 0.87);
    return;
  }
  // Support natural two-finger trackpad horizontal scroll (or vertical wheel pan)
  const deltaPx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(deltaPx) > 0.5) {
    e.preventDefault();
    viewStartSec.value = clampViewStart(viewStartSec.value + deltaPx / pixelsPerSec.value);
  }
}

function onMinimapPointerDown(e: PointerEvent) {
  const bar = e.currentTarget as HTMLElement;
  const rect = bar.getBoundingClientRect();
  const updateFromEvent = (ev: PointerEvent) => {
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const target = ratio * Math.max(1, project.duration);
    viewStartSec.value = clampViewStart(target - viewSpanSec.value * 0.5);
  };
  updateFromEvent(e);
  const onUp = () => {
    window.removeEventListener('pointermove', updateFromEvent);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', updateFromEvent);
  window.addEventListener('pointerup', onUp);
}

// High-DPI Croonify-Style Blue Waveform & Shaded Region Canvas Renderer
function drawWaveform() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const w = Math.max(100, viewportWidth.value);
  const h = canvasHeight;
  const dpr = window.devicePixelRatio || 1;

  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  // 1. Neutral background (unassigned/gap regions — matches Croonify light gray-slate)
  ctx.fillStyle = '#e5e9ee';
  ctx.fillRect(0, 0, w, h);

  // 2. Active timed regions shaded in pale sky blue (Slides 6 & 7)
  for (const it of visibleItems.value) {
    const x1 = Math.max(0, timeToX(it.startSec));
    const x2 = Math.min(w, timeToX(it.endSec));
    if (x2 > x1) {
      ctx.fillStyle = it.isSelected ? '#bfe3fb' : '#d6eaf8';
      ctx.fillRect(x1, 0, x2 - x1, h);

      // Crisp boundary lines
      ctx.strokeStyle = it.isSelected ? '#0284c7' : '#ffffff';
      ctx.lineWidth = it.isSelected ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, h);
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, h);
      ctx.stroke();
    }
  }

  // 3. Center zero-crossing reference line
  const midY = h * 0.5;
  ctx.strokeStyle = '#94b8d0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  // 4. Real Vocal Stem Waveform in crisp ocean blue (#1f82c4)
  const peaks = project.waveformPeaks;
  const pps = project.peaksPerSecond || 120;

  if (peaks && peaks.length > 0) {
    const totalBuckets = peaks.length / 2;
    const ampRadius = h * 0.44;
    ctx.fillStyle = '#1f82c4';

    for (let px = 0; px < w; px++) {
      const t0 = xToTime(px);
      const t1 = xToTime(px + 1);
      if (t1 < 0) continue;

      const b0 = Math.max(0, Math.floor(t0 * pps));
      const b1 = Math.min(totalBuckets - 1, Math.ceil(t1 * pps));
      if (b0 >= totalBuckets) break;

      let minV = 0;
      let maxV = 0;
      if (b1 <= b0) {
        minV = peaks[b0 * 2] ?? 0;
        maxV = peaks[b0 * 2 + 1] ?? 0;
      } else {
        for (let b = b0; b <= b1; b++) {
          const mn = peaks[b * 2];
          const mx = peaks[b * 2 + 1];
          if (mn < minV) minV = mn;
          if (mx > maxV) maxV = mx;
        }
      }

      const topY = midY - maxV * ampRadius;
      const botY = midY - minV * ampRadius;
      const barH = Math.max(1.2, botY - topY);
      ctx.fillRect(px, topY, 1, barH);
    }
  }

  // 5. Subtle time ruler ticks along bottom edge
  const span = viewSpanSec.value;
  const tickStep = span > 25 ? 5 : span > 10 ? 2 : 1;
  const firstTick = Math.ceil(viewStartSec.value / tickStep) * tickStep;
  ctx.fillStyle = '#475569';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  for (let sec = firstTick; sec <= viewEndSec.value; sec += tickStep) {
    const tx = timeToX(sec);
    ctx.fillRect(tx, h - 8, 1, 8);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, tx + 4, h - 4);
  }

  // 6. Red Playhead Vertical Line (Slide 6)
  const playX = timeToX(project.currentTime);
  if (playX >= -2 && playX <= w + 2) {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();
  }

  ctx.restore();
}

function isFirstLineOfFrame(lineIdx: number): boolean {
  if (lineIdx === 0) return true;
  return project.lines[lineIdx].frameIndex !== project.lines[lineIdx - 1].frameIndex;
}

// Keyboard Shortcuts (Space = Play/Pause, Cmd+Z = Undo, T = Tap Sync in Line Mode)
function onKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    project.undo();
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    void project.togglePlay();
    return;
  }

  if (props.mode === 'line' && e.key.toLowerCase() === 't' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    project.tapSyncCurrentLine();
  }
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (timelineWrapRef.value) {
    viewportWidth.value = timelineWrapRef.value.clientWidth || 900;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (timelineWrapRef.value) {
          viewportWidth.value = timelineWrapRef.value.clientWidth || 900;
        }
      });
      resizeObserver.observe(timelineWrapRef.value);
    }
  }
  const initialTarget = project.lines[project.selectedLineIndex]?.startSec ?? 0;
  centerViewportAround(initialTarget);
  drawWaveform();
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div class="h-full flex flex-col bg-white px-6 py-4 gap-3.5 overflow-hidden select-none">
    <!-- TOP HALF: Centered Scrollable Lyric List (Slides 6 & 7) -->
    <div
      ref="lyricScrollRef"
      class="flex-1 min-h-[190px] overflow-y-auto border border-slate-300 rounded-xl bg-white px-5 py-3 shadow-2xs"
    >
      <div v-if="project.lines.length === 0" class="h-full flex items-center justify-center text-lg text-slate-400">
        No lyrics synced yet. Paste lyrics on Basics and click Apply & Re-Sync.
      </div>

      <template v-for="(line, lIdx) in project.lines" :key="line.id">
        <!-- Blank Stanza Separator Row (matches Croonify's empty rule row between stanzas!) -->
        <div
          v-if="line.stanzaBreakBefore"
          class="h-8 border-b border-slate-200"
        ></div>

        <!-- Lyric Row -->
        <div
          :data-line-row="lIdx"
          class="relative py-2.5 border-b border-slate-200 flex items-center justify-center text-center transition-colors"
          :class="
            mode === 'line'
              ? 'cursor-pointer hover:bg-slate-50'
              : ''
          "
          @click="mode === 'line' ? selectLineFromList(lIdx) : undefined"
        >
          <!-- Left Frame Number Badge (1, 2, 3...) -->
          <div
            v-if="isFirstLineOfFrame(lIdx)"
            class="absolute left-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5"
          >
            <span
              class="min-w-[26px] px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-sm font-bold text-center"
              :title="`Screen Frame ${line.frameIndex + 1}`"
            >
              {{ line.frameIndex + 1 }}
            </span>
          </div>

          <!-- LINE TIMINGS MODE TEXT -->
          <span
            v-if="mode === 'line'"
            class="text-[19px] leading-snug px-3 py-0.5 rounded-md transition-colors"
            :class="
              project.activeLineIndexAtPlayhead === lIdx || project.selectedLineIndex === lIdx
                ? 'bg-[#3dbeff] text-slate-950 font-semibold'
                : 'text-slate-900 font-medium'
            "
          >
            {{ line.text }}
          </span>

          <!-- WORD TIMINGS MODE TOKENS -->
          <div v-else class="flex flex-wrap items-center justify-center gap-1.5 px-14">
            <button
              v-for="(word, wIdx) in line.words"
              :key="word.id"
              type="button"
              @click.stop="selectWordFromList(lIdx, wIdx)"
              class="text-[19px] leading-snug px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              :class="
                (project.currentTime >= word.startSec && project.currentTime <= word.endSec) ||
                project.selectedWordId === word.id
                  ? 'bg-[#3dbeff] text-slate-950 font-semibold'
                  : 'text-slate-900 font-medium hover:bg-slate-100'
              "
            >
              {{ word.text }}
            </button>
          </div>

          <!-- Right Subtle Timestamp Hint -->
          <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
            {{ formatClock(line.startSec) }}
          </span>
        </div>
      </template>
    </div>

    <!-- BOTTOM HALF: Pill Capsule Track + Real Blue Waveform Viewport (Slides 6 & 7) -->
    <div
      ref="timelineWrapRef"
      class="shrink-0 flex flex-col gap-1"
      @wheel="onTimelineWheel"
    >
      <!-- Live Drag Readout Pill -->
      <div class="h-5 flex items-center justify-between px-1 text-xs text-slate-500">
        <span>
          {{
            mode === 'line'
              ? 'Drag pill edges or blue shading lines to adjust line start/end • Click waveform to scrub'
              : 'Drag word capsules or edges to fine-tune syllable timing • Scroll horizontally to pan'
          }}
        </span>
        <span v-if="activeDragInfo" class="font-mono font-semibold text-brand-purple bg-purple-50 px-2.5 py-0.5 rounded-full">
          {{ activeDragInfo }}
        </span>
      </div>

      <!-- 1. Draggable Pill Capsule Track (Directly above Waveform!) -->
      <div class="relative w-full h-10 overflow-hidden">
        <div
          v-for="item in visibleItems"
          :key="item.key"
          class="absolute top-1 h-8 rounded-full border flex items-center justify-center overflow-hidden shadow-2xs transition-colors group"
          :class="
            item.isPlayingNow || item.isSelected
              ? 'bg-[#3dbeff] border-[#0284c7] text-slate-950 font-semibold z-10'
              : 'bg-[#f4f6f8] hover:bg-[#e8eef5] border-slate-300 text-slate-900 font-medium'
          "
          :style="{
            left: `${timeToX(item.startSec)}px`,
            width: `${Math.max(18, (item.endSec - item.startSec) * pixelsPerSec)}px`,
          }"
          @pointerdown="startItemDrag(item, 'move', $event)"
        >
          <!-- Left Resize Handle -->
          <div
            @pointerdown.stop="startItemDrag(item, 'start', $event)"
            class="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-slate-900/15 z-20"
            title="Drag start time"
          ></div>

          <!-- Capsule Label -->
          <span class="px-2.5 text-[15px] truncate pointer-events-none">
            {{ item.label }}
          </span>

          <!-- Right Resize Handle -->
          <div
            @pointerdown.stop="startItemDrag(item, 'end', $event)"
            class="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-slate-900/15 z-20"
            title="Drag end time"
          ></div>
        </div>
      </div>

      <!-- 2. High-DPI Blue Vocal Waveform Canvas -->
      <div class="relative w-full rounded-lg overflow-hidden border border-slate-300">
        <canvas
          ref="canvasRef"
          class="block w-full"
          :class="hoverBoundaryCursor ? 'cursor-ew-resize' : 'cursor-pointer'"
          :style="{ height: `${canvasHeight}px` }"
          @pointermove="onCanvasPointerMove"
          @pointerdown="onCanvasPointerDown"
        ></canvas>
      </div>

      <!-- 3. Song Minimap / Horizontal Overview Scrubber -->
      <div
        v-if="project.duration > 0"
        class="relative w-full h-3.5 bg-slate-100 hover:bg-slate-200/80 rounded-full border border-slate-200 cursor-pointer overflow-hidden mt-0.5"
        title="Click or drag to jump anywhere in the song"
        @pointerdown="onMinimapPointerDown"
      >
        <!-- Viewport Window Thumb -->
        <div
          class="absolute top-0 bottom-0 bg-sky-300/70 border-x border-sky-500 rounded-full"
          :style="{
            left: `${(viewStartSec / project.duration) * 100}%`,
            width: `${Math.min(100, (viewSpanSec / project.duration) * 100)}%`,
          }"
        ></div>
        <!-- Playhead Dot on Minimap -->
        <div
          class="absolute top-0 bottom-0 w-0.5 bg-red-600"
          :style="{ left: `${(project.currentTime / project.duration) * 100}%` }"
        ></div>
      </div>
    </div>

    <!-- TRANSPORT & TOOLS BAR (Bottom Row matching Slides 6 & 7) -->
    <div class="shrink-0 pt-1 flex items-center justify-between gap-4">
      <!-- Left Helpers: Undo + Tap Sync + Speed -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          :disabled="project.undoStack.length === 0"
          @click="project.undo()"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 text-sm font-semibold text-slate-800 transition-colors"
          title="Undo timing adjustment (⌘Z)"
        >
          <Undo2 class="w-4 h-4" />
          <span>Undo</span>
        </button>

        <button
          v-if="mode === 'line'"
          type="button"
          @click="project.tapSyncCurrentLine()"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sm font-semibold text-sky-950 transition-colors"
          title="Press T while audio plays to stamp the selected line's start time"
        >
          <Hand class="w-4 h-4 text-sky-600" />
          <span>Tap Start (T)</span>
        </button>

        <select
          :value="project.playbackRate"
          @change="project.setPlaybackRate(Number(($event.target as HTMLSelectElement).value))"
          class="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 cursor-pointer"
          title="Playback Speed"
        >
          <option :value="1">1.0× Speed</option>
          <option :value="0.75">0.75× Slow</option>
          <option :value="0.5">0.5× Half</option>
        </select>
      </div>

      <!-- Center Play/Pause + Clock -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          @click="project.togglePlay()"
          class="w-11 h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-900 shadow-2xs transition-colors cursor-pointer"
          title="Play / Pause (Spacebar)"
        >
          <Pause v-if="project.isPlaying" class="w-5 h-5 fill-current" />
          <Play v-else class="w-5 h-5 fill-current ml-0.5" />
        </button>

        <span class="font-mono text-base font-semibold text-slate-700 min-w-[140px]">
          {{ formatClock(project.currentTime) }}
          <span class="text-slate-400 font-normal">/ {{ formatClock(project.duration) }}</span>
        </span>
      </div>

      <!-- Right Zoom - / + Buttons (Slides 6 & 7) -->
      <div class="inline-flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden shadow-2xs">
        <button
          type="button"
          @click="zoomBy(0.75)"
          class="w-9 h-9 flex items-center justify-center hover:bg-slate-100 text-slate-900 border-r border-slate-300 transition-colors cursor-pointer"
          title="Zoom Out Waveform"
        >
          <Minus class="w-4 h-4" />
        </button>
        <button
          type="button"
          @click="zoomBy(1.33)"
          class="w-9 h-9 flex items-center justify-center hover:bg-slate-100 text-slate-900 transition-colors cursor-pointer"
          title="Zoom In Waveform"
        >
          <Plus class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>
