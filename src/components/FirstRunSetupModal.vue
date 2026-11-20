<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  useProjectStore,
  showFirstRunSetupRef,
  type SystemCapabilities,
} from '../stores/projectStore';
import { CheckCircle2, Download, Loader2, AlertCircle, Sparkles, X } from '@lucide/vue';

interface SetupProgressEvent {
  step: string;
  percent: number;
  message: string;
}

const project = useProjectStore();
const showModal = showFirstRunSetupRef;

const isInstalling = ref(false);
const progressPercent = ref(0);
const progressMessage = ref('');
const installError = ref<string | null>(null);
const installCompleted = ref(false);

let unlistenProgress: UnlistenFn | null = null;

onMounted(async () => {
  if (project.isTauriEnv) {
    try {
      unlistenProgress = await listen<SetupProgressEvent>('setup-progress', (event) => {
        progressPercent.value = event.payload.percent;
        progressMessage.value = event.payload.message;
      });
    } catch {
      // Ignore outside Tauri
    }
  }
});

onBeforeUnmount(() => {
  unlistenProgress?.();
});

async function startAutoInstall() {
  isInstalling.value = true;
  installError.value = null;
  installCompleted.value = false;
  progressPercent.value = 5;
  progressMessage.value = 'Starting one-click KaraoCraft setup...';

  try {
    const caps = await invoke<SystemCapabilities>('install_runtime_dependencies');
    project.systemCaps = caps;
    progressPercent.value = 100;
    progressMessage.value = 'All AI & video engines are ready!';
    installCompleted.value = true;
    setTimeout(() => {
      showModal.value = false;
    }, 1200);
  } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err);
  } finally {
    isInstalling.value = false;
  }
}
</script>

<template>
  <div
    v-if="showModal"
    class="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center p-6"
    @click.self="!isInstalling && (showModal = false)"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-7 text-slate-900">
      <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div class="inline-flex items-center gap-1.5 text-brand-purple font-bold text-xs uppercase tracking-wider mb-1">
            <Sparkles class="w-4 h-4" />
            <span>First-Run Studio Setup</span>
          </div>
          <h2 class="text-2xl font-bold text-slate-900">
            Install AI Sync &amp; Video Engines
          </h2>
        </div>

        <button
          v-if="!isInstalling"
          type="button"
          @click="showModal = false"
          class="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="mt-4 space-y-4 text-sm text-slate-600 leading-relaxed">
        <p>
          To automatically extract vocals &amp; instrumentals, synchronize lyrics, and export 1080p MP4 karaoke videos, KaraoCraft can download and configure its local AI engines in the background (one-time setup):
        </p>

        <!-- Status Checklist -->
        <div class="space-y-2.5">
          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div>
              <div class="font-bold text-slate-900">1. FFmpeg Video Engine</div>
              <div class="text-xs text-slate-500">MP4 video rendering &amp; subtitle burn-in</div>
            </div>
            <span
              class="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              :class="
                project.systemCaps.ffmpegAvailable
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              "
            >
              {{ project.systemCaps.ffmpegAvailable ? 'Ready' : 'Will Install' }}
            </span>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div>
              <div class="font-bold text-slate-900">2. AI Phonetic Aligner (MMS_FA)</div>
              <div class="text-xs text-slate-500">Python 3.12 runtime, PyTorch Audio, uroman &amp; pykakasi</div>
            </div>
            <span
              class="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              :class="
                project.systemCaps.whisperAvailable
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              "
            >
              {{ project.systemCaps.whisperAvailable ? 'Ready' : 'Will Install' }}
            </span>
          </div>

          <div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between gap-3">
            <div>
              <div class="font-bold text-slate-900">3. AI Stem Separator (BS-Roformer)</div>
              <div class="text-xs text-slate-500">Built-in vocal, instrumental &amp; backing vocal extraction on Apple GPU</div>
            </div>
            <span
              class="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
              :class="
                project.systemCaps.separatorAvailable
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              "
            >
              {{ project.systemCaps.separatorAvailable ? 'Ready' : 'Will Install' }}
            </span>
          </div>
        </div>

        <!-- Live Progress Bar -->
        <div v-if="isInstalling || installCompleted" class="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
          <div class="flex items-center justify-between text-xs font-semibold text-brand-purple">
            <span class="flex items-center gap-2">
              <Loader2 v-if="isInstalling" class="w-4 h-4 animate-spin" />
              <CheckCircle2 v-else class="w-4 h-4 text-emerald-600" />
              <span>{{ progressMessage }}</span>
            </span>
            <span>{{ progressPercent }}%</span>
          </div>
          <div class="w-full h-2 bg-purple-200/70 rounded-full overflow-hidden">
            <div
              class="h-full bg-brand-purple transition-all duration-300 rounded-full"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>

        <!-- Error Banner -->
        <div
          v-if="installError"
          class="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-red-800"
        >
          <AlertCircle class="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>{{ installError }}</div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
        <button
          type="button"
          :disabled="isInstalling"
          @click="showModal = false"
          class="text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
        >
          Skip for Now
        </button>

        <button
          type="button"
          :disabled="isInstalling"
          @click="startAutoInstall"
          class="inline-flex items-center gap-2 bg-brand-purple hover:bg-brand-purpleHover text-white font-semibold text-sm px-5 py-2.5 rounded-xl shadow-sm transition-colors disabled:opacity-60 cursor-pointer"
        >
          <Loader2 v-if="isInstalling" class="w-4 h-4 animate-spin" />
          <Download v-else class="w-4 h-4" />
          <span>{{ isInstalling ? 'Installing...' : 'Download & Install Automatically' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
