<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore';
import { RefreshCw, RotateCcw, X } from '@lucide/vue';

const project = useProjectStore();
</script>

<template>
  <div
    v-if="project.showResyncModal"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-6"
    @click.self="project.showResyncModal = false"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-7 text-slate-900">
      <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <h2 class="text-2xl font-bold text-slate-900">Resynchronize Timings</h2>
        <button
          type="button"
          @click="project.showResyncModal = false"
          class="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <p class="mt-4 text-base text-slate-700 leading-relaxed">
        Choose how you would like KaraoCraft to recalculate timings:
      </p>

      <div class="mt-5 space-y-3.5">
        <button
          type="button"
          @click="project.resyncWordsFromCurrentLines()"
          class="w-full text-left p-4 rounded-xl border-2 border-purple-200 bg-purple-50/60 hover:bg-purple-50 hover:border-brand-purple transition-all group"
        >
          <div class="flex items-center gap-2.5 font-bold text-lg text-slate-900 group-hover:text-brand-purple">
            <RefreshCw class="w-5 h-5 text-brand-purple" />
            <span>Resync Words Inside My Line Timings (Recommended)</span>
          </div>
          <p class="mt-1 text-sm text-slate-600 leading-relaxed pl-7">
            Keeps your custom Line Start & End positions intact and re-distributes all words inside each line to match the vocal waveform.
          </p>
        </button>

        <button
          type="button"
          @click="project.resetAndResyncAll()"
          class="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all"
        >
          <div class="flex items-center gap-2.5 font-bold text-lg text-slate-900">
            <RotateCcw class="w-5 h-5 text-slate-600" />
            <span>Reset Everything & Re-Align Entire Song</span>
          </div>
          <p class="mt-1 text-sm text-slate-600 leading-relaxed pl-7">
            Rebuilds both Line Timings and Word Timings from scratch using your current lyrics in Basics. (Undoable with ⌘Z)
          </p>
        </button>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          type="button"
          @click="project.showResyncModal = false"
          class="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-base transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>
