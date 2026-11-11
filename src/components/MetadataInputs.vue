<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore';
import { Disc3, User, Sparkles } from '@lucide/vue';

const project = useProjectStore();
</script>

<template>
  <div class="bg-obsidian-850 border border-slate-800 rounded-xl p-4 space-y-3.5">
    <div class="flex items-center justify-between">
      <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
        <Sparkles class="w-3.5 h-3.5 text-karaoke-yellow" />
        <span>Song Details</span>
      </h3>
      <span class="text-[10px] text-slate-400">Used for Intro Title Card & Exports</span>
    </div>

    <div class="space-y-3">
      <!-- Title Input -->
      <div>
        <label class="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
          <Disc3 class="w-3 h-3 text-slate-400" />
          <span>Song Title</span>
        </label>
        <input 
          v-model="project.title"
          type="text" 
          placeholder="e.g. A Cruel Angel's Thesis / 残酷な天使のテーゼ"
          class="w-full bg-obsidian-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-karaoke-cyan focus:ring-1 focus:ring-karaoke-cyan transition-colors"
        />
      </div>

      <!-- Artist Input -->
      <div>
        <label class="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
          <User class="w-3 h-3 text-slate-400" />
          <span>Artist / Performer</span>
        </label>
        <input 
          v-model="project.artist"
          type="text" 
          placeholder="e.g. Yoko Takahashi / 高橋洋子"
          class="w-full bg-obsidian-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-karaoke-cyan focus:ring-1 focus:ring-karaoke-cyan transition-colors"
        />
      </div>
    </div>

    <!-- Intro Card Live Badge Preview -->
    <div 
      v-if="project.title || project.artist"
      class="bg-obsidian-900/80 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs"
    >
      <div class="flex items-center gap-2 overflow-hidden">
        <span class="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono shrink-0">INTRO PREVIEW</span>
        <span class="text-slate-300 font-medium truncate">
          {{ project.title || 'Untitled' }} — {{ project.artist || 'Unknown Artist' }}
        </span>
      </div>
      <span class="text-[10px] text-slate-400 shrink-0 font-mono">
        {{ project.styleConfig.introCard.durationSeconds }}s
      </span>
    </div>
  </div>
</template>

