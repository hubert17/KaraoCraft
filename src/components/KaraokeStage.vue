<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore, WordToken } from '../stores/projectStore';
import { Play, Pause, Volume2, Mic, Music } from '@lucide/vue';

const project = useProjectStore();

// Compute active line and upcoming line based on currentTime
const currentTimeMs = computed(() => project.currentTime * 1000);

const activeLineIndex = computed(() => {
  return project.lines.findIndex(l => {
    return currentTimeMs.value >= l.startMs && currentTimeMs.value <= l.endMs;
  });
});

const currentLine = computed(() => {
  if (activeLineIndex.value >= 0) {
    return project.lines[activeLineIndex.value];
  }
  // If in between lines, find upcoming line
  return project.lines.find(l => l.startMs > currentTimeMs.value) || null;
});

const upcomingLine = computed(() => {
  if (activeLineIndex.value >= 0 && activeLineIndex.value + 1 < project.lines.length) {
    return project.lines[activeLineIndex.value + 1];
  }
  return null;
});

// Check whether intro title card is active
const isIntroActive = computed(() => {
  if (!project.styleConfig.introCard.enabled) return false;
  const firstLineStart = project.lines[0]?.startMs || 4000;
  return currentTimeMs.value < Math.min(firstLineStart, project.styleConfig.introCard.durationSeconds * 1000);
});

// Check whether outro is active
const isOutroActive = computed(() => {
  if (!project.styleConfig.outroCard.enabled) return false;
  const lastLineEnd = project.lines[project.lines.length - 1]?.endMs || 100000;
  return currentTimeMs.value > lastLineEnd;
});

// Compute individual word fill progress (0.0 to 1.0)
function getWordProgress(word: WordToken): number {
  if (currentTimeMs.value < word.startMs) return 0;
  if (currentTimeMs.value >= word.endMs) return 1;
  const duration = word.endMs - word.startMs;
  if (duration <= 0) return 1;
  return (currentTimeMs.value - word.startMs) / duration;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}
</script>

<template>
  <div class="flex flex-col bg-obsidian-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
    <!-- Stage Canvas (16:9 Aspect Ratio) -->
    <div 
      class="relative w-full aspect-video bg-obsidian-950 flex flex-col items-center justify-center p-8 select-none overflow-hidden"
      :style="{
        backgroundColor: project.styleConfig.bgColor,
        fontFamily: project.styleConfig.fontFamily
      }"
    >
      <!-- Background overlay / gradient -->
      <div class="absolute inset-0 bg-radial-gradient opacity-20 pointer-events-none"></div>

      <!-- 1. Opening Intro Title Card -->
      <div 
        v-if="isIntroActive" 
        class="flex flex-col items-center text-center animate-fade-in z-10"
      >
        <span class="text-xs uppercase tracking-widest text-karaoke-cyan font-semibold mb-2 font-mono">
          ♫ KARAOKE INTRO ♫
        </span>
        <h1 
          class="text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-lg"
          :style="{
            textTransform: project.styleConfig.allCaps ? 'uppercase' : 'none'
          }"
        >
          {{ project.title || 'Song Title' }}
        </h1>
        <p class="text-lg md:text-xl text-slate-300 font-medium mt-1 drop-shadow">
          {{ project.artist || 'Artist Name' }}
        </p>
      </div>

      <!-- 2. Closing Outro Screen -->
      <div 
        v-else-if="isOutroActive" 
        class="flex flex-col items-center text-center animate-fade-in z-10"
      >
        <h2 class="text-3xl md:text-4xl font-extrabold text-karaoke-cyan tracking-tight mb-2 drop-shadow-lg">
          {{ project.styleConfig.outroCard.message }}
        </h2>
        <p class="text-base text-slate-300">
          {{ project.title }} — {{ project.artist }}
        </p>
      </div>

      <!-- 3. Active Karaoke Lyrics Lines -->
      <div 
        v-else 
        class="flex flex-col items-center justify-center w-full max-w-4xl space-y-4 text-center z-10"
        :class="project.styleConfig.verticalPosition === 'bottom' ? 'mt-auto pb-4' : 'my-auto'"
      >
        <!-- Active / Focus Line -->
        <div v-if="currentLine" class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span
            v-for="word in currentLine.words"
            :key="word.id"
            class="relative inline-block font-extrabold"
            :style="{
              fontSize: `${project.styleConfig.fontSize}px`,
              textTransform: project.styleConfig.allCaps ? 'uppercase' : 'none',
            }"
          >
            <!-- Inactive Base Layer (Outline + Drop Shadow) -->
            <span 
              class="relative z-0"
              :style="{
                color: project.styleConfig.inactiveColor,
                WebkitTextStroke: `${project.styleConfig.outlineWidth}px ${project.styleConfig.outlineColor}`,
                textShadow: `0 3px ${project.styleConfig.shadowBlur}px rgba(0,0,0,0.85)`
              }"
            >
              {{ word.text }}
            </span>

            <!-- Active Wipe Layer (Clipped progressive color sweep) -->
            <span
              class="absolute inset-0 z-10 pointer-events-none"
              :style="{
                color: project.styleConfig.activeColor,
                WebkitTextStroke: `${project.styleConfig.outlineWidth}px ${project.styleConfig.outlineColor}`,
                clipPath: `inset(0 calc(100% - ${getWordProgress(word) * 100}%) 0 0)`,
                textShadow: `0 0 12px ${project.styleConfig.activeColor}55`
              }"
            >
              {{ word.text }}
            </span>
          </span>
        </div>

        <!-- Upcoming Line Preview -->
        <div 
          v-if="upcomingLine && project.styleConfig.screenLines >= 2"
          class="flex flex-wrap items-center justify-center gap-x-2 opacity-50 transition-opacity"
        >
          <span
            v-for="word in upcomingLine.words"
            :key="word.id"
            class="font-bold text-slate-300"
            :style="{
              fontSize: `${project.styleConfig.fontSize * 0.75}px`,
              textTransform: project.styleConfig.allCaps ? 'uppercase' : 'none',
              WebkitTextStroke: `1.5px ${project.styleConfig.outlineColor}`,
            }"
          >
            {{ word.text }}
          </span>
        </div>
      </div>
    </div>

    <!-- Stage Bottom Playback & Mixing Bar -->
    <div class="px-4 py-2.5 bg-obsidian-850 border-t border-slate-800 flex items-center justify-between text-xs">
      <!-- Left: Play / Pause & Time Readout -->
      <div class="flex items-center gap-3">
        <button
          @click="project.isPlaying = !project.isPlaying"
          class="w-7 h-7 rounded-full bg-karaoke-cyan text-obsidian-950 flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-transform"
        >
          <Pause v-if="project.isPlaying" class="w-3.5 h-3.5 fill-current" />
          <Play v-else class="w-3.5 h-3.5 fill-current ml-0.5" />
        </button>

        <span class="font-mono text-slate-300 font-medium">
          {{ formatTime(project.currentTime) }}
          <span class="text-slate-500">/ {{ formatTime(project.vocalStem?.durationSeconds || 180) }}</span>
        </span>
      </div>

      <!-- Center: Stem Soloing Audio Switcher -->
      <div class="flex items-center bg-obsidian-950 p-0.5 rounded-lg border border-slate-800">
        <button
          @click="project.audioSource = 'vocal'"
          :class="[
            'px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
            project.audioSource === 'vocal' ? 'bg-karaoke-cyan/20 text-karaoke-cyan border border-karaoke-cyan/40' : 'text-slate-400 hover:text-slate-200'
          ]"
        >
          <Mic class="w-3 h-3" />
          <span>Vocals Solo</span>
        </button>

        <button
          @click="project.audioSource = 'instrumental'"
          :class="[
            'px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
            project.audioSource === 'instrumental' ? 'bg-karaoke-purple/20 text-karaoke-purple border border-karaoke-purple/40' : 'text-slate-400 hover:text-slate-200'
          ]"
        >
          <Music class="w-3 h-3" />
          <span>Music Solo</span>
        </button>

        <button
          @click="project.audioSource = 'both'"
          :class="[
            'px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
            project.audioSource === 'both' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
          ]"
        >
          <Volume2 class="w-3 h-3" />
          <span>Mixed</span>
        </button>
      </div>

      <!-- Right: Screen Lines Quick Toggle -->
      <div class="flex items-center gap-1.5 text-slate-400">
        <span class="text-[11px]">Lines:</span>
        <select 
          v-model="project.styleConfig.screenLines" 
          class="bg-obsidian-900 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-xs focus:outline-none"
        >
          <option :value="1">1 Line</option>
          <option :value="2">2 Lines (Standard)</option>
          <option :value="3">3 Lines</option>
          <option :value="4">4 Lines</option>
        </select>
      </div>
    </div>
  </div>
</template>

