<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useProjectStore, WordToken, LyricLine } from '../stores/projectStore';
import { Keyboard, ZoomIn, ZoomOut } from '@lucide/vue';

const project = useProjectStore();
const isTapToSyncActive = ref(false);
const activeTapWordIndex = ref(0);
const activeTapLineIndex = ref(0);
const zoomLevel = ref(1.0); // pixels per millisecond factor

// Dragging state
const draggingWord = ref<{
  word: WordToken;
  line: LyricLine;
  mode: 'move' | 'resize-start' | 'resize-end';
  startX: number;
  origStartMs: number;
  origEndMs: number;
} | null>(null);

function startDrag(e: MouseEvent, line: LyricLine, word: WordToken, mode: 'move' | 'resize-start' | 'resize-end') {
  e.stopPropagation();
  draggingWord.value = {
    word,
    line,
    mode,
    startX: e.clientX,
    origStartMs: word.startMs,
    origEndMs: word.endMs,
  };
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!draggingWord.value) return;
  const deltaX = e.clientX - draggingWord.value.startX;
  const deltaMs = Math.round(deltaX / (0.12 * zoomLevel.value));

  const { word, mode, origStartMs, origEndMs } = draggingWord.value;

  if (mode === 'move') {
    const duration = origEndMs - origStartMs;
    word.startMs = Math.max(0, origStartMs + deltaMs);
    word.endMs = word.startMs + duration;
  } else if (mode === 'resize-start') {
    word.startMs = Math.min(word.endMs - 50, Math.max(0, origStartMs + deltaMs));
  } else if (mode === 'resize-end') {
    word.endMs = Math.max(word.startMs + 50, origEndMs + deltaMs);
  }
}

function onMouseUp() {
  draggingWord.value = null;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
}

// Tap-to-Sync: Spacebar handler
function handleKeyDown(e: KeyboardEvent) {
  if (!isTapToSyncActive.value) return;

  if (e.code === 'Space') {
    e.preventDefault();
    const currentMs = Math.round(project.currentTime * 1000);
    const line = project.lines[activeTapLineIndex.value];
    if (line && line.words[activeTapWordIndex.value]) {
      const word = line.words[activeTapWordIndex.value];
      word.startMs = currentMs;
      // Default duration is 300ms until next tap
      word.endMs = currentMs + 300;

      // Update previous word end time to seamlessly connect
      if (activeTapWordIndex.value > 0) {
        line.words[activeTapWordIndex.value - 1].endMs = currentMs;
      }

      // Advance to next word
      if (activeTapWordIndex.value + 1 < line.words.length) {
        activeTapWordIndex.value++;
      } else if (activeTapLineIndex.value + 1 < project.lines.length) {
        activeTapLineIndex.value++;
        activeTapWordIndex.value = 0;
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

function jumpToLine(line: LyricLine) {
  project.currentTime = line.startMs / 1000;
}
</script>

<template>
  <div class="flex flex-col bg-obsidian-850 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex-1">
    <!-- Toolbar -->
    <div class="px-4 py-2 bg-obsidian-800 border-b border-slate-800 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="font-semibold text-slate-200">Word Timing Timeline</span>
        <span class="text-[10px] text-slate-400 font-mono">
          Drag body to shift • Drag edges to trim duration
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Tap-To-Sync Toggle Button -->
        <button
          @click="isTapToSyncActive = !isTapToSyncActive"
          :class="[
            'px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all',
            isTapToSyncActive 
              ? 'bg-karaoke-pink text-white shadow-[0_0_12px_rgba(255,42,133,0.4)] animate-pulse' 
              : 'bg-obsidian-700 text-slate-300 hover:text-white border border-slate-600'
          ]"
        >
          <Keyboard class="w-3.5 h-3.5" />
          <span>{{ isTapToSyncActive ? 'TAP-TO-SYNC ACTIVE (Spacebar)' : 'Tap-To-Sync Mode' }}</span>
        </button>

        <!-- Zoom Controls -->
        <div class="flex items-center bg-obsidian-900 rounded border border-slate-700 p-0.5">
          <button 
            @click="zoomLevel = Math.max(0.5, zoomLevel - 0.2)" 
            class="p-1 text-slate-400 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut class="w-3.5 h-3.5" />
          </button>
          <span class="px-1.5 text-[10px] font-mono text-slate-400">{{ Math.round(zoomLevel * 100) }}%</span>
          <button 
            @click="zoomLevel = Math.min(2.5, zoomLevel + 0.2)" 
            class="p-1 text-slate-400 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Timeline Tracks Area -->
    <div class="flex-1 p-4 overflow-y-auto space-y-3">
      <div
        v-for="(line, lineIdx) in project.lines"
        :key="line.id"
        class="bg-obsidian-900 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
      >
        <!-- Line Header & Jump Button -->
        <div class="flex items-center justify-between mb-2">
          <button 
            @click="jumpToLine(line)"
            class="flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-karaoke-cyan transition-colors"
          >
            <span class="w-5 h-5 rounded bg-slate-800 text-[10px] flex items-center justify-center font-mono text-slate-400">
              {{ lineIdx + 1 }}
            </span>
            <span>{{ line.text }}</span>
          </button>

          <span class="text-[10px] font-mono text-slate-500">
            {{ (line.startMs / 1000).toFixed(1) }}s — {{ (line.endMs / 1000).toFixed(1) }}s
          </span>
        </div>

        <!-- Word Timing Pills Ribbon -->
        <div class="flex flex-wrap gap-1.5 pt-1">
          <div
            v-for="word in line.words"
            :key="word.id"
            class="group relative select-none rounded bg-slate-800/90 border border-slate-700 hover:border-karaoke-cyan hover:bg-slate-700 px-2.5 py-1 text-xs font-mono font-medium text-slate-200 cursor-grab active:cursor-grabbing flex items-center transition-all shadow-sm"
          >
            <!-- Left Resize Handle -->
            <div 
              @mousedown="startDrag($event, line, word, 'resize-start')"
              class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-karaoke-cyan rounded-l opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag to trim start"
            ></div>

            <!-- Body (Drag to Move) -->
            <span @mousedown="startDrag($event, line, word, 'move')">
              {{ word.text }}
            </span>

            <!-- Millisecond Tag Badge -->
            <span class="ml-1 text-[9px] text-slate-400 font-mono">
              {{ word.endMs - word.startMs }}ms
            </span>

            <!-- Right Resize Handle -->
            <div 
              @mousedown="startDrag($event, line, word, 'resize-end')"
              class="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-karaoke-cyan rounded-r opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag to trim sustain duration"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
