<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useProjectStore } from './stores/projectStore';
import TopNav from './components/TopNav.vue';
import AudioDropzone from './components/AudioDropzone.vue';
import MetadataInputs from './components/MetadataInputs.vue';
import LyricsEditor from './components/LyricsEditor.vue';
import KaraokeStage from './components/KaraokeStage.vue';
import TimingTimeline from './components/TimingTimeline.vue';
import StylingPanel from './components/StylingPanel.vue';
import ExportView from './components/ExportView.vue';
import { Sparkles, ArrowRight, RefreshCw, SlidersHorizontal } from '@lucide/vue';

const project = useProjectStore();
const showStyleDrawer = ref(false);

// Playback animation clock
let animationFrameId: number;
let lastTimestamp: number = 0;

function updatePlayback(timestamp: number) {
  if (lastTimestamp === 0) lastTimestamp = timestamp;
  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;

  if (project.isPlaying) {
    const maxDuration = project.vocalStem?.durationSeconds || 180;
    if (project.currentTime + delta >= maxDuration) {
      project.currentTime = 0;
      project.isPlaying = false;
    } else {
      project.currentTime += delta;
    }
  }

  animationFrameId = requestAnimationFrame(updatePlayback);
}

onMounted(() => {
  animationFrameId = requestAnimationFrame(updatePlayback);
});

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId);
});
</script>

<template>
  <div class="flex flex-col h-screen w-screen bg-obsidian-950 text-slate-100 overflow-hidden font-sans">
    <!-- Top Navigation Bar -->
    <TopNav />

    <!-- Main Workspace Area -->
    <main class="flex-1 flex overflow-hidden relative">
      <!-- 1. Setup Workspace (Intake View) -->
      <div 
        v-if="project.currentView === 'setup'"
        class="flex-1 flex flex-col overflow-hidden"
      >
        <!-- Split Workspace (Audio on Left, Lyrics on Right) -->
        <div class="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
          <!-- Left Column (42%): Audio Stems & Metadata -->
          <div class="col-span-5 flex flex-col space-y-4 overflow-y-auto pr-1">
            <AudioDropzone />
            <MetadataInputs />
          </div>

          <!-- Right Column (58%): Lyrics Editor Studio -->
          <div class="col-span-7 flex flex-col h-full overflow-hidden">
            <LyricsEditor />
          </div>
        </div>

        <!-- Setup Bottom Action Bar -->
        <div class="h-16 bg-obsidian-900 border-t border-slate-800 px-6 flex items-center justify-between shrink-0 shadow-lg">
          <div class="text-xs text-slate-400">
            <span v-if="!project.hasVocalStem" class="text-amber-400 font-medium">
              ⚠️ Please load a vocal stem to begin synchronization.
            </span>
            <span v-else-if="!project.rawLyrics.trim()" class="text-amber-400 font-medium">
              ⚠️ Please paste song lyrics on the right.
            </span>
            <span v-else class="text-emerald-400 flex items-center gap-1.5 font-medium">
              ✓ Ready to generate automatic word-level timing!
            </span>
          </div>

          <div class="flex items-center gap-3">
            <div v-if="project.isGenerating" class="flex items-center gap-2">
              <RefreshCw class="w-4 h-4 text-karaoke-cyan animate-spin" />
              <span class="text-xs text-slate-300 font-mono">Analyzing vocals & mapping words…</span>
            </div>

            <button
              @click="project.generateBaselineTiming"
              :disabled="!project.canGenerate || project.isGenerating"
              class="px-5 py-2.5 rounded-lg bg-gradient-to-r from-karaoke-violet to-karaoke-cyan text-white font-bold text-xs shadow-[0_0_15px_rgba(0,229,255,0.25)] hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 cursor-pointer"
            >
              <Sparkles class="w-4 h-4" />
              <span>Generate Karaoke Timing</span>
              <ArrowRight class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Polishing Editor Workspace (Stage + Timeline) -->
      <div 
        v-else-if="project.currentView === 'editor'"
        class="flex-1 flex flex-col overflow-hidden p-4 space-y-4"
      >
        <div class="grid grid-cols-12 gap-4 h-[55%] min-h-[300px]">
          <!-- Left: 16:9 Karaoke Live Stage -->
          <div :class="showStyleDrawer ? 'col-span-8' : 'col-span-12'" class="h-full transition-all">
            <div class="relative h-full flex flex-col">
              <KaraokeStage />
              <!-- Toggle Styling Drawer Pill -->
              <button
                @click="showStyleDrawer = !showStyleDrawer"
                class="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-md bg-obsidian-900/90 border border-slate-700 text-xs text-slate-200 hover:text-karaoke-cyan flex items-center gap-1.5 shadow-md backdrop-blur cursor-pointer"
              >
                <SlidersHorizontal class="w-3.5 h-3.5 text-karaoke-cyan" />
                <span>{{ showStyleDrawer ? 'Hide Styles' : 'Customize Styles' }}</span>
              </button>
            </div>
          </div>

          <!-- Right: Visual Styling Drawer (Optional) -->
          <div v-if="showStyleDrawer" class="col-span-4 h-full overflow-hidden">
            <StylingPanel class="h-full" />
          </div>
        </div>

        <!-- Bottom: Word Timing Timeline Ribbon -->
        <div class="flex-1 overflow-hidden flex flex-col">
          <TimingTimeline />
        </div>
      </div>

      <!-- 3. Export & Delivery Workspace -->
      <div 
        v-else-if="project.currentView === 'export'"
        class="flex-1 overflow-y-auto"
      >
        <ExportView />
      </div>
    </main>
  </div>
</template>
