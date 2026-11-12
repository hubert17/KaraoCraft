<script setup lang="ts">
import { useProjectStore, type EditorTab } from '../stores/projectStore';

const project = useProjectStore();

function selectTab(tab: EditorTab) {
  project.activeTab = tab;
}
</script>

<template>
  <aside class="w-56 shrink-0 bg-white border-r border-slate-200 py-5 px-4 flex flex-col gap-3 select-none">
    <!-- 1. Basics (Croonify Sky Blue) -->
    <button
      type="button"
      @click="selectTab('basics')"
      class="w-full text-left px-4 py-3 rounded-xl text-[17px] font-semibold transition-all shadow-xs"
      :class="
        project.activeTab === 'basics'
          ? 'bg-[#3dbeff] text-slate-950 shadow-pill'
          : 'bg-[#e8eaed] hover:bg-[#dcdfe4] text-slate-900'
      "
    >
      <div class="flex items-center justify-between">
        <span>Basics</span>
        <span
          v-if="project.lyricsModifiedSinceSync"
          class="w-2.5 h-2.5 rounded-full bg-amber-500"
          title="Lyrics edited since last sync"
        ></span>
      </div>
    </button>

    <!-- 2. Options (Croonify Cyan) -->
    <button
      type="button"
      @click="selectTab('options')"
      class="w-full text-left px-4 py-3 rounded-xl text-[17px] font-semibold transition-all shadow-xs"
      :class="
        project.activeTab === 'options'
          ? 'bg-[#00dddd] text-slate-950 shadow-pill'
          : 'bg-[#e8eaed] hover:bg-[#dcdfe4] text-slate-900'
      "
    >
      Options
    </button>

    <!-- 3. Line Timings (Croonify Coral Pink) -->
    <button
      type="button"
      @click="selectTab('line-timings')"
      class="w-full text-left px-4 py-3 rounded-xl text-[17px] font-semibold transition-all shadow-xs"
      :class="
        project.activeTab === 'line-timings'
          ? 'bg-[#ff9494] text-slate-950 shadow-pill'
          : 'bg-[#e8eaed] hover:bg-[#dcdfe4] text-slate-900'
      "
    >
      Line Timings
    </button>

    <!-- 4. Resync (Croonify Lavender Trigger) -->
    <button
      type="button"
      @click="project.showResyncModal = true"
      class="w-full text-left px-4 py-3 rounded-xl text-[17px] font-semibold transition-all shadow-xs bg-[#e8eaed] hover:bg-[#d8d4fe] active:bg-[#c4b5fd] text-slate-900"
    >
      Resync
    </button>

    <!-- 5. Word Timings (Croonify Coral Red) -->
    <button
      type="button"
      @click="selectTab('word-timings')"
      class="w-full text-left px-4 py-3 rounded-xl text-[17px] font-semibold transition-all shadow-xs"
      :class="
        project.activeTab === 'word-timings'
          ? 'bg-[#ff4d4f] text-white shadow-pill'
          : 'bg-[#e8eaed] hover:bg-[#dcdfe4] text-slate-900'
      "
    >
      Word Timings
    </button>

    <!-- 6. Video / Export (Croonify Royal Purple) -->
    <button
      type="button"
      @click="selectTab('video')"
      class="w-full text-left px-4 py-3 rounded-xl text-[17px] font-semibold transition-all shadow-xs"
      :class="
        project.activeTab === 'video'
          ? 'bg-brand-purple text-white shadow-pill'
          : 'bg-[#e8eaed] hover:bg-[#dcdfe4] text-slate-900'
      "
    >
      Video
    </button>

    <div class="mt-auto pt-4 border-t border-slate-200 px-1 space-y-1.5 text-sm text-slate-500">
      <div class="flex justify-between">
        <span>Lines</span>
        <span class="font-semibold text-slate-800">{{ project.lines.length }}</span>
      </div>
      <div class="flex justify-between">
        <span>Words</span>
        <span class="font-semibold text-slate-800">{{ project.totalWordsCount }}</span>
      </div>
      <div class="flex justify-between">
        <span>Frames</span>
        <span class="font-semibold text-slate-800">{{ project.totalFramesCount }}</span>
      </div>
    </div>
  </aside>
</template>
