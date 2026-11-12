<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { buildFrameGroups } from '../services/subtitleExporter';
import type { WordSegment } from '../services/alignmentEngine';

const props = withDefaults(
  defineProps<{
    /** If true, displays the 4 draggable white corner circles and static/sample preview when paused */
    editableBox?: boolean;
    maxHeightPx?: number;
  }>(),
  {
    editableBox: false,
    maxHeightPx: 320,
  }
);

const project = useProjectStore();
const stageRef = ref<HTMLDivElement | null>(null);
const stageWidthPx = ref(480);
const stageHeightPx = ref(360);
const isDraggingCorner = ref<string | null>(null);

let resizeObserver: ResizeObserver | null = null;

function measureStage() {
  if (!stageRef.value) return;
  stageWidthPx.value = stageRef.value.clientWidth || 480;
  stageHeightPx.value = stageRef.value.clientHeight || 360;
}

onMounted(() => {
  measureStage();
  if (stageRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => measureStage());
    resizeObserver.observe(stageRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

const frameGroups = computed(() => buildFrameGroups(project.lines, project.duration));

// Active frame group for live video playback
const activePlaybackGroup = computed(() => {
  const t = project.currentTime;
  for (const g of frameGroups.value) {
    if (t >= g.displayStartSec && t <= g.displayEndSec) {
      return g;
    }
  }
  return null;
});

const showIntroCard = computed(() => {
  if (props.editableBox && !project.isPlaying) return false;
  const firstStart = frameGroups.value[0]?.displayStartSec ?? 4.0;
  return (
    (project.title.trim() !== '' || project.artist.trim() !== '') &&
    firstStart >= 1.2 &&
    project.currentTime >= 0 &&
    project.currentTime < Math.min(firstStart - 0.2, 5.0)
  );
});

// Sample preview lines used in Options mode so the user always sees a full frame with bounding box & colors
const optionsPreviewLines = computed(() => {
  const targetCount = project.options.linesPerFrame;
  if (project.lines.length > 0) {
    const firstFrame = frameGroups.value[0]?.lines ?? project.lines.slice(0, targetCount);
    if (firstFrame.length >= targetCount) {
      return firstFrame.slice(0, targetCount);
    }
    // Pad from subsequent lines if first stanza has fewer lines so user can preview full frame capacity
    return project.lines.slice(0, targetCount);
  }

  const fallbackTexts = [
    'Lorem ipsum dolor sit amet,',
    'consectetur adipiscing elit,',
    'sed do eiusmod tempor incididunt',
    'ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam,',
    'quis nostrud exercitation ullamco',
    'laboris nisi ut aliquip ex ea',
    'commodo consequat duis aute.',
  ];

  return fallbackTexts.slice(0, targetCount).map((text, idx) => ({
    id: `sample-${idx}`,
    text,
    startSec: idx * 2,
    endSec: idx * 2 + 1.8,
    stanzaBreakBefore: false,
    frameIndex: 0,
    words: text.split(' ').map((w, wIdx) => ({
      id: `sw-${idx}-${wIdx}`,
      text: w,
      startSec: idx * 2 + wIdx * 0.4,
      endSec: idx * 2 + (wIdx + 1) * 0.4,
    })),
  }));
});

const displayedLines = computed(() => {
  if (props.editableBox && !project.isPlaying) {
    return optionsPreviewLines.value;
  }
  return activePlaybackGroup.value?.lines ?? [];
});

// Font size scaled proportionally to stageHeightPx (matching 1080p PlayResY in ASS)
const scaledFontSizePx = computed(() => {
  const scale = stageHeightPx.value / 1080;
  return Math.max(11, project.options.textSize * 2.12 * scale);
});

const textStrokeStyle = computed(() => {
  if (!project.options.outline) return {};
  const strokePx = Math.max(1.2, scaledFontSizePx.value * 0.12);
  const c = project.options.outlineColor;
  return {
    WebkitTextStroke: `${strokePx.toFixed(1)}px ${c}`,
    paintOrder: 'stroke fill',
    textShadow: `0 0 ${(strokePx * 1.4).toFixed(1)}px ${c}`,
  };
});

function getWordFillPercent(word: WordSegment, lineIdx: number, wordIdx: number): number {
  // In static Options preview, show first line partially swept so user sees both Sung & Unsung colors!
  if (props.editableBox && !project.isPlaying) {
    if (lineIdx === 0) {
      if (wordIdx === 0) return 100;
      if (wordIdx === 1) return 55;
    }
    return 0;
  }

  const t = project.currentTime;
  if (t <= word.startSec) return 0;
  if (t >= word.endSec) return 100;
  const dur = Math.max(0.01, word.endSec - word.startSec);
  return Math.min(100, Math.max(0, ((t - word.startSec) / dur) * 100));
}

function getLineTopPercent(idxInGroup: number, actualCount: number): number {
  const totalSlots = Math.max(project.options.linesPerFrame, actualCount);
  const topSlotOffset = (totalSlots - actualCount) * 0.5;
  return ((topSlotOffset + idxInGroup + 0.5) / totalSlots) * 100;
}

// 4-Corner Bounding Box Drag Interaction (Slide 3)
function startCornerDrag(corner: 'tl' | 'tr' | 'bl' | 'br' | 'move', e: PointerEvent) {
  if (!props.editableBox || !stageRef.value) return;
  e.preventDefault();
  e.stopPropagation();

  isDraggingCorner.value = corner;
  const rect = stageRef.value.getBoundingClientRect();
  const initLeft = project.options.boxLeft;
  const initTop = project.options.boxTop;
  const initWidth = project.options.boxWidth;
  const initHeight = project.options.boxHeight;
  const startX = e.clientX;
  const startY = e.clientY;

  const onMove = (ev: PointerEvent) => {
    const mx = Math.max(0.01, Math.min(0.99, (ev.clientX - rect.left) / rect.width));
    const my = Math.max(0.02, Math.min(0.98, (ev.clientY - rect.top) / rect.height));

    if (corner === 'move') {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      project.updateBoundingBox({
        boxLeft: project.options.hCenter ? initLeft : initLeft + dx,
        boxTop: project.options.vCenter ? initTop : initTop + dy,
      });
      return;
    }

    let nextLeft = initLeft;
    let nextWidth = initWidth;
    let nextTop = initTop;
    let nextHeight = initHeight;

    // Horizontal calculation
    if (project.options.hCenter) {
      nextWidth = Math.abs(mx - 0.5) * 2;
      nextLeft = (1 - nextWidth) * 0.5;
    } else if (corner === 'tl' || corner === 'bl') {
      const rightEdge = initLeft + initWidth;
      nextLeft = Math.min(rightEdge - 0.25, mx);
      nextWidth = rightEdge - nextLeft;
    } else {
      nextWidth = Math.max(0.25, mx - initLeft);
    }

    // Vertical calculation (controls line spacing!)
    if (project.options.vCenter) {
      nextHeight = Math.abs(my - 0.5) * 2;
      nextTop = (1 - nextHeight) * 0.5;
    } else if (corner === 'tl' || corner === 'tr') {
      const bottomEdge = initTop + initHeight;
      nextTop = Math.min(bottomEdge - 0.16, my);
      nextHeight = bottomEdge - nextTop;
    } else {
      nextHeight = Math.max(0.16, my - initTop);
    }

    project.updateBoundingBox({
      boxLeft: nextLeft,
      boxTop: nextTop,
      boxWidth: nextWidth,
      boxHeight: nextHeight,
    });
  };

  const onUp = () => {
    isDraggingCorner.value = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
</script>

<template>
  <div class="w-full flex flex-col items-center">
    <div
      ref="stageRef"
      class="relative overflow-hidden rounded-xl shadow-lg border border-slate-300 select-none"
      :style="{
        backgroundColor: project.options.bgColor,
        aspectRatio: project.options.aspectRatio === '4:3' ? '4 / 3' : '16 / 9',
        height: `${maxHeightPx}px`,
        maxWidth: '100%',
      }"
    >
      <!-- Intro Song Title & Artist Card -->
      <div
        v-if="showIntroCard"
        class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center pointer-events-none"
      >
        <div
          class="font-bold tracking-tight leading-tight"
          :style="{
            fontSize: `${scaledFontSizePx * 1.18}px`,
            color: project.options.unsungColor,
            ...textStrokeStyle,
          }"
        >
          {{ project.title }}
        </div>
        <div
          v-if="project.artist"
          class="mt-2 font-semibold"
          :style="{
            fontSize: `${scaledFontSizePx * 0.78}px`,
            color: project.options.activeColor,
            ...textStrokeStyle,
          }"
        >
          {{ project.artist }}
        </div>
      </div>

      <!-- Lyrics Bounding Box (with optional 4-corner handles in Options mode) -->
      <div
        v-else
        class="absolute"
        :class="[
          editableBox ? 'border border-dashed border-white/35 hover:border-white/65 transition-colors' : '',
          editableBox && (!project.options.hCenter || !project.options.vCenter) ? 'cursor-move' : '',
        ]"
        :style="{
          left: `${project.options.boxLeft * 100}%`,
          top: `${project.options.boxTop * 100}%`,
          width: `${project.options.boxWidth * 100}%`,
          height: `${project.options.boxHeight * 100}%`,
        }"
        @pointerdown="
          editableBox && (!project.options.hCenter || !project.options.vCenter)
            ? startCornerDrag('move', $event)
            : undefined
        "
      >
        <!-- Rendered Frame Lines -->
        <div
          v-for="(line, lIdx) in displayedLines"
          :key="line.id"
          class="absolute left-0 right-0 -translate-y-1/2 text-center whitespace-normal leading-tight px-2 pointer-events-none"
          :style="{
            top: `${getLineTopPercent(lIdx, displayedLines.length)}%`,
            fontSize: `${scaledFontSizePx}px`,
            fontWeight: project.options.bold ? 700 : 400,
          }"
        >
          <span
            v-for="(word, wIdx) in line.words"
            :key="word.id"
            class="relative inline-block mx-[0.14em]"
          >
            <!-- Base Unsung Layer -->
            <span
              :style="{
                color: project.options.unsungColor,
                ...textStrokeStyle,
              }"
            >
              {{ word.text }}
            </span>

            <!-- Active Karaoke Sweep Wipe Layer -->
            <span
              class="absolute left-0 top-0 overflow-hidden whitespace-nowrap pointer-events-none"
              :style="{
                width: `${getWordFillPercent(word, lIdx, wIdx)}%`,
                color: project.options.activeColor,
                ...textStrokeStyle,
              }"
            >
              {{ word.text }}
            </span>
          </span>
        </div>

        <!-- 4 Draggable White Corner Circles (Slide 3) -->
        <template v-if="editableBox">
          <div
            @pointerdown="startCornerDrag('tl', $event)"
            class="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-white border-2 border-slate-900 shadow-md cursor-nwse-resize hover:scale-125 transition-transform z-20"
            title="Drag to resize lyrics width & line spacing"
          ></div>
          <div
            @pointerdown="startCornerDrag('tr', $event)"
            class="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-white border-2 border-slate-900 shadow-md cursor-nesw-resize hover:scale-125 transition-transform z-20"
            title="Drag to resize lyrics width & line spacing"
          ></div>
          <div
            @pointerdown="startCornerDrag('bl', $event)"
            class="absolute -left-2 -bottom-2 w-4 h-4 rounded-full bg-white border-2 border-slate-900 shadow-md cursor-nesw-resize hover:scale-125 transition-transform z-20"
            title="Drag to resize lyrics width & line spacing"
          ></div>
          <div
            @pointerdown="startCornerDrag('br', $event)"
            class="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-white border-2 border-slate-900 shadow-md cursor-nwse-resize hover:scale-125 transition-transform z-20"
            title="Drag to resize lyrics width & line spacing"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>
