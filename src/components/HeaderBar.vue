<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { FolderOpen, Save, HelpCircle, ArrowLeft } from '@lucide/vue';

const project = useProjectStore();
const loadInputRef = ref<HTMLInputElement | null>(null);

function handleBackToSetup() {
  project.pauseAudio();
  project.screen = 'setup';
}

async function onProjectFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await project.loadProjectFile(file);
  } catch {
    alert('Could not read .karaocraft.json project file.');
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <header
    class="w-full bg-white border-b border-slate-200 select-none shrink-0 titlebar-drag"
    :class="project.screen === 'setup' ? 'pt-7 pb-3 px-8' : 'pt-6 pb-2.5 px-6'"
  >
    <input
      ref="loadInputRef"
      type="file"
      accept=".json,.karaocraft"
      class="hidden"
      @change="onProjectFileChange"
    />

    <!-- Setup Screen Header: Centered Musical Staff Banner (Slide 1 style) -->
    <div v-if="project.screen === 'setup'" class="max-w-6xl mx-auto relative flex items-center justify-center">
      <div class="w-full musical-staff-bg py-2 flex items-center justify-center">
        <div class="bg-white/90 px-6 rounded-full flex items-baseline gap-1">
          <span class="text-5xl font-serif font-bold tracking-tight text-slate-900">𝄞</span>
          <span class="text-5xl font-script italic font-bold tracking-wide text-slate-900">
            KaraoCraft
          </span>
        </div>
      </div>

      <div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2.5 titlebar-no-drag">
        <button
          type="button"
          @click="project.showUvrGuideModal = true"
          class="inline-flex items-center gap-1.5 bg-white hover:bg-purple-50 text-brand-purple border border-purple-200 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors"
        >
          <HelpCircle class="w-4 h-4" />
          <span>UVR Vocal Guide</span>
        </button>
        <button
          type="button"
          @click="loadInputRef?.click()"
          class="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm transition-colors"
        >
          <FolderOpen class="w-4 h-4" />
          <span>Open Project</span>
        </button>
      </div>
    </div>

    <!-- Editor Screen Header: Left Brand on Musical Staff + Song Badge + Actions (Slide 2 style) -->
    <div v-else class="w-full musical-staff-bg py-1 flex items-center justify-between gap-4 pl-14">
      <div class="flex items-center gap-4 titlebar-no-drag">
        <button
          type="button"
          @click="handleBackToSetup"
          class="bg-white/95 hover:bg-slate-50 px-3 py-1 rounded-xl border border-transparent hover:border-slate-200 flex items-center gap-2 transition-all group"
          title="Back to Song Setup"
        >
          <ArrowLeft class="w-4 h-4 text-slate-400 group-hover:text-slate-800 transition-colors" />
          <span class="text-2xl font-serif font-bold text-slate-900">𝄞</span>
          <span class="text-3xl font-script italic font-bold text-slate-900 leading-none">
            KaraoCraft
          </span>
        </button>

        <div
          v-if="project.title || project.artist"
          class="bg-white/95 border border-slate-200 rounded-full px-4 py-1 text-base text-slate-700 shadow-sm truncate max-w-md"
        >
          <span class="font-semibold text-slate-900">{{ project.title || 'Untitled Song' }}</span>
          <span v-if="project.artist" class="text-slate-500"> — {{ project.artist }}</span>
        </div>
      </div>

      <div class="flex items-center gap-2.5 bg-white/95 px-2 py-0.5 rounded-xl titlebar-no-drag">
        <button
          type="button"
          @click="project.showUvrGuideModal = true"
          class="inline-flex items-center gap-1.5 text-slate-600 hover:text-brand-purple hover:bg-purple-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
        >
          <HelpCircle class="w-4 h-4" />
          <span>UVR Guide</span>
        </button>
        <button
          type="button"
          @click="loadInputRef?.click()"
          class="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
        >
          <FolderOpen class="w-4 h-4" />
          <span>Open</span>
        </button>
        <button
          type="button"
          @click="project.saveProjectFile()"
          class="inline-flex items-center gap-1.5 bg-brand-purple hover:bg-brand-purpleHover text-white rounded-lg px-3.5 py-1.5 text-sm font-semibold shadow-sm transition-colors"
        >
          <Save class="w-4 h-4" />
          <span>Save Project</span>
        </button>
      </div>
    </div>
  </header>
</template>
