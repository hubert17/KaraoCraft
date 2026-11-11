<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore';
import { Mic2, Sliders, Download, Check, Sparkles } from '@lucide/vue';

const project = useProjectStore();
</script>

<template>
  <header class="h-12 bg-obsidian-900 border-b border-slate-800 flex items-center justify-between px-4 select-none titlebar-drag shrink-0">
    <!-- Left: App Branding (Leaves space for macOS traffic light buttons) -->
    <div class="flex items-center gap-3 pl-16 titlebar-no-drag">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-md bg-gradient-to-tr from-karaoke-violet to-karaoke-cyan flex items-center justify-center text-white shadow-sm">
          <Mic2 class="w-3.5 h-3.5" />
        </div>
        <span class="font-bold text-sm text-slate-100 tracking-tight flex items-center gap-1">
          KaraoCraft
          <span class="text-[9px] font-mono px-1.5 py-0.2 bg-karaoke-cyan/10 text-karaoke-cyan rounded border border-karaoke-cyan/30">MAC</span>
        </span>
      </div>
    </div>

    <!-- Center: View Switcher Navigation Tabs -->
    <div class="flex items-center bg-obsidian-950 p-1 rounded-lg border border-slate-800 titlebar-no-drag">
      <button
        @click="project.currentView = 'setup'"
        :class="[
          'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
          project.currentView === 'setup'
            ? 'bg-obsidian-700 text-white shadow-sm border border-slate-600/50'
            : 'text-slate-400 hover:text-slate-200'
        ]"
      >
        <Sliders class="w-3.5 h-3.5" />
        <span>1. Setup</span>
        <Check v-if="project.canGenerate" class="w-3 h-3 text-emerald-400" />
      </button>

      <button
        @click="project.currentView = 'editor'"
        :disabled="project.lines.length === 0"
        :class="[
          'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed',
          project.currentView === 'editor'
            ? 'bg-obsidian-700 text-karaoke-cyan shadow-sm border border-slate-600/50'
            : 'text-slate-400 hover:text-slate-200'
        ]"
      >
        <Sparkles class="w-3.5 h-3.5 text-karaoke-cyan" />
        <span>2. Polishing Editor</span>
        <span v-if="project.lines.length > 0" class="text-[10px] bg-slate-800 px-1 rounded font-mono text-slate-300">
          {{ project.lines.length }}
        </span>
      </button>

      <button
        @click="project.currentView = 'export'"
        :disabled="project.lines.length === 0"
        :class="[
          'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed',
          project.currentView === 'export'
            ? 'bg-obsidian-700 text-white shadow-sm border border-slate-600/50'
            : 'text-slate-400 hover:text-slate-200'
        ]"
      >
        <Download class="w-3.5 h-3.5" />
        <span>3. Styling & Export</span>
      </button>
    </div>

    <!-- Right: Project Stats / Quick Info -->
    <div class="flex items-center gap-2 titlebar-no-drag">
      <div v-if="project.title" class="text-xs text-slate-400 max-w-[200px] truncate font-medium">
        {{ project.title }}
      </div>
    </div>
  </header>
</template>
