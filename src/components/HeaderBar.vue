<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore, showAboutModalRef } from '../stores/projectStore';
import {
  FilePlus2,
  FolderOpen,
  Save,
  HelpCircle,
  ArrowLeft,
  ChevronDown,
  Check,
  AlertCircle,
  Info,
  X,
} from '@lucide/vue';

const project = useProjectStore();
const loadInputRef = ref<HTMLInputElement | null>(null);
const showSaveMenu = ref(false);
const saveSplitRef = ref<HTMLElement | null>(null);

function isInteractiveElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('button, input, a, select, textarea, .titlebar-no-drag'));
}

function onTitlebarMouseDown(e: MouseEvent) {
  if (e.button !== 0 || isInteractiveElement(e.target)) return;
  if (!project.isTauriEnv) return;
  if (e.detail === 1) {
    void invoke('start_window_drag').catch(() => undefined);
  }
}

function onTitlebarDoubleClick(e: MouseEvent) {
  if (isInteractiveElement(e.target)) return;
  if (!project.isTauriEnv) return;
  e.preventDefault();
  void invoke('toggle_window_maximize').catch(() => undefined);
}

function handleBackToSetup() {
  project.pauseAudio();
  project.screen = 'setup';
}

async function handleOpenClick() {
  const handledNatively = await project.openProjectFromDialog();
  if (!handledNatively) {
    loadInputRef.value?.click();
  }
}

async function onProjectFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await project.loadProjectFile(file);
  } catch {
    // Error is already stored in project.projectFileError and displayed in the banner
  } finally {
    input.value = '';
  }
}

async function handlePrimarySave() {
  showSaveMenu.value = false;
  await project.saveProjectFile();
}

async function handleSaveAs() {
  showSaveMenu.value = false;
  await project.saveProjectFileAs();
}

function handleDocumentClick(e: MouseEvent) {
  if (!showSaveMenu.value) return;
  if (saveSplitRef.value && !saveSplitRef.value.contains(e.target as Node)) {
    showSaveMenu.value = false;
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    if (project.screen !== 'editor') return;
    e.preventDefault();
    if (e.shiftKey) {
      handleSaveAs();
    } else {
      handlePrimarySave();
    }
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick);
  window.addEventListener('keydown', handleKeyDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentClick);
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <header
    data-tauri-drag-region
    @mousedown="onTitlebarMouseDown"
    @dblclick="onTitlebarDoubleClick"
    class="w-full bg-white border-b border-slate-200 select-none shrink-0 titlebar-drag relative cursor-default"
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
          @click="project.newProject()"
          title="New Project (Clear Everything)"
          aria-label="New Project"
          class="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl p-2 shadow-sm transition-colors"
        >
          <FilePlus2 class="w-4 h-4" />
        </button>
        <button
          type="button"
          @click="handleOpenClick"
          title="Open Project (.json)"
          aria-label="Open Project"
          class="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl p-2 shadow-sm transition-colors"
        >
          <FolderOpen class="w-4 h-4" />
        </button>
        <button
          type="button"
          @click="showAboutModalRef = true"
          title="About KaraoCraft"
          aria-label="About KaraoCraft"
          class="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl p-2 shadow-sm transition-colors"
        >
          <Info class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Editor Screen Header: Left Brand on Musical Staff + Song Badge + Actions (Slide 2 style) -->
    <div v-else class="w-full musical-staff-bg py-1 flex items-center justify-between gap-4 pl-14">
      <div class="flex items-center gap-4">
        <button
          type="button"
          @click="handleBackToSetup"
          class="bg-white/95 hover:bg-slate-50 px-3 py-1 rounded-xl border border-transparent hover:border-slate-200 flex items-center gap-2 transition-all group titlebar-no-drag"
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
          @click="project.newProject()"
          title="New Project (Clear Everything)"
          aria-label="New Project"
          class="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg p-1.5 transition-colors"
        >
          <FilePlus2 class="w-4 h-4" />
        </button>
        <button
          type="button"
          @click="handleOpenClick"
          title="Open Project (.json)"
          aria-label="Open Project"
          class="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg p-1.5 transition-colors"
        >
          <FolderOpen class="w-4 h-4" />
        </button>

        <!-- Split Save / Save As Button -->
        <div ref="saveSplitRef" class="relative inline-flex items-stretch shadow-sm rounded-lg">
          <button
            type="button"
            @click="handlePrimarySave"
            :title="
              project.projectFilePath
                ? `Save to ${project.projectFilePath} (⌘S)`
                : 'Save Project (⌘S)'
            "
            class="inline-flex items-center gap-1.5 bg-brand-purple hover:bg-brand-purpleHover text-white rounded-l-lg pl-3.5 pr-2.5 py-1.5 text-sm font-semibold transition-colors"
          >
            <Check v-if="project.projectSaveStatus" class="w-4 h-4 text-emerald-300" />
            <Save v-else class="w-4 h-4" />
            <span>{{ project.projectSaveStatus || 'Save Project' }}</span>
          </button>

          <button
            type="button"
            @click="showSaveMenu = !showSaveMenu"
            title="More Save Options"
            aria-label="Save Options Dropdown"
            class="inline-flex items-center justify-center bg-brand-purple hover:bg-brand-purpleHover text-white border-l border-white/25 rounded-r-lg px-2 py-1.5 text-sm font-semibold transition-colors"
          >
            <ChevronDown class="w-4 h-4" />
          </button>

          <!-- Dropdown Menu -->
          <div
            v-if="showSaveMenu"
            class="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 text-left"
          >
            <button
              type="button"
              @click="handleSaveAs"
              class="w-full px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-purple-50 hover:text-brand-purple flex items-center justify-between transition-colors"
            >
              <span class="flex items-center gap-2">
                <FolderOpen class="w-4 h-4" />
                <span>Save As…</span>
              </span>
              <span class="text-xs text-slate-400 font-mono">⇧⌘S</span>
            </button>

            <div
              v-if="project.projectFilePath"
              class="mt-1 pt-1.5 px-3.5 pb-1 border-t border-slate-100 text-[11px] text-slate-400 truncate"
              :title="project.projectFilePath"
            >
              Path: {{ project.projectFilePath }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Invalid Project File Error Banner -->
    <div
      v-if="project.projectFileError"
      class="mt-2.5 max-w-4xl mx-auto bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-sm text-red-800 titlebar-no-drag"
    >
      <div class="flex items-center gap-2 font-medium">
        <AlertCircle class="w-4 h-4 text-red-600 shrink-0" />
        <span>{{ project.projectFileError }}</span>
      </div>
      <button
        type="button"
        @click="project.projectFileError = null"
        class="text-red-500 hover:text-red-800 p-1 rounded-lg transition-colors"
        title="Dismiss"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
  </header>
</template>
