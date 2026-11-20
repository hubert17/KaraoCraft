<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useProjectStore, type MelodyGuideStyle } from '../stores/projectStore';
import KaraokeRenderer from './KaraokeRenderer.vue';
import {
  Play,
  Pause,
  Film,
  Music,
  AudioLines,
  Headphones,
  Mic,
  ImagePlus,
  FileCode,
  FileText,
  FolderOpen,
  Loader2,
  CheckCircle2,
  X,
  Upload,
  SlidersHorizontal,
  ChevronDown,
} from '@lucide/vue';

const project = useProjectStore();

const pageRef = ref<HTMLDivElement | null>(null);
const transportControlsRef = ref<HTMLDivElement | null>(null);
const bottomCardsRef = ref<HTMLDivElement | null>(null);
const previewMaxHeightPx = ref(300);
let resizeObserver: ResizeObserver | null = null;

function recalcPreviewHeight() {
  if (!pageRef.value || !transportControlsRef.value || !bottomCardsRef.value) return;
  const pageH = pageRef.value.clientHeight;
  const transportH = transportControlsRef.value.offsetHeight;
  const bottomH = bottomCardsRef.value.offsetHeight;
  // Account for py-5 (40px), gap (16px), player box padding/border (34px), and transport mt-3 (12px)
  const available = pageH - transportH - bottomH - 102;
  previewMaxHeightPx.value = Math.max(185, Math.floor(available));
}

onMounted(() => {
  recalcPreviewHeight();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => recalcPreviewHeight());
    if (pageRef.value) resizeObserver.observe(pageRef.value);
    if (transportControlsRef.value) resizeObserver.observe(transportControlsRef.value);
    if (bottomCardsRef.value) resizeObserver.observe(bottomCardsRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

const instInputRef = ref<HTMLInputElement | null>(null);
const backingVocalInputRef = ref<HTMLInputElement | null>(null);
const bgImageInputRef = ref<HTMLInputElement | null>(null);
const renderQuality = ref<'1080p' | '720p'>('1080p');
const backingPanelMode = ref<'files' | 'gain'>('files');

const INST_SNAP_STOPS = [-6, -3, -1, 0, 1, 3, 6];
const BACKING_SNAP_STOPS = [-12, -6, -3, -1, 0, 1, 3, 6];
const MELODY_SNAP_STOPS = [-9, -6, -3, 0, 3];

function applyMagneticSnap(raw: number, stops: number[], threshold = 0.3): number {
  for (const stop of stops) {
    if (Math.abs(raw - stop) <= threshold) {
      return stop;
    }
  }
  return Math.round(raw * 10) / 10;
}

function formatDb(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  if (Math.abs(rounded) < 0.05) return '0 dB';
  const sign = rounded > 0 ? '+' : '';
  return Number.isInteger(rounded) ? `${sign}${rounded} dB` : `${sign}${rounded.toFixed(1)} dB`;
}

function onInstrumentalGainInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value);
  project.setInstrumentalGainDb(applyMagneticSnap(raw, INST_SNAP_STOPS, 0.3));
}

function onBackingGainInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value);
  project.setBackingVocalGainDb(applyMagneticSnap(raw, BACKING_SNAP_STOPS, 0.35));
}

function onMelodyGainInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value);
  project.setMelodyGuideGainDb(applyMagneticSnap(raw, MELODY_SNAP_STOPS, 0.3));
}

function onMelodyStyleChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value as MelodyGuideStyle;
  void project.setMelodyGuideStyle(val);
}

const melodyStyleLabel = computed(() =>
  project.melodyGuideStyle === 'flute'
    ? 'Flute'
    : project.melodyGuideStyle === 'synth'
      ? 'Synth'
      : ''
);

const hasActiveGain = computed(
  () =>
    Math.abs(project.instrumentalGainDb) >= 0.05 ||
    (Boolean(project.backingVocalFile) && Math.abs(project.backingVocalGainDb) >= 0.05) ||
    (Boolean(project.melodyGuideFile) && Math.abs(project.melodyGuideGainDb - -3) >= 0.05)
);

const offsetOptions = [
  { value: -2, label: '-2.0s (Earlier)' },
  { value: -1.5, label: '-1.5s' },
  { value: -1, label: '-1.0s' },
  { value: -0.5, label: '-0.5s' },
  { value: 0, label: '0s (Default)' },
  { value: 0.5, label: '+0.5s' },
  { value: 1, label: '+1.0s' },
  { value: 1.5, label: '+1.5s' },
  { value: 2, label: '+2.0s (Later)' },
];
const exportAudioChoice = ref<'instrumental' | 'melody' | 'vocal'>(
  project.instrumentalFile
    ? project.melodyGuideFile && project.melodyGuideStyle !== 'none'
      ? 'melody'
      : 'instrumental'
    : 'vocal'
);

watch(
  () => project.instrumentalFile,
  (file) => {
    exportAudioChoice.value = file
      ? project.melodyGuideFile && project.melodyGuideStyle !== 'none'
        ? 'melody'
        : 'instrumental'
      : 'vocal';
    if (!file) {
      backingPanelMode.value = 'files';
    }
  }
);

watch(
  () => [project.melodyGuideStyle, project.melodyGuideFile] as const,
  ([style, file]) => {
    if (project.instrumentalFile && style !== 'none' && file) {
      exportAudioChoice.value = 'melody';
    } else if (exportAudioChoice.value === 'melody') {
      exportAudioChoice.value = project.instrumentalFile ? 'instrumental' : 'vocal';
    }
  }
);

function formatClock(sec: number): string {
  const clamped = Math.max(0, sec || 0);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function handleBrowseInstrumental() {
  const handledNatively = await project.browseInstrumentalFile();
  if (!handledNatively) {
    instInputRef.value?.click();
  }
}

function onInstSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    project.selectInstrumentalFile(file);
  }
  input.value = '';
}

async function handleBrowseBackingVocal() {
  const handledNatively = await project.browseBackingVocalFile();
  if (!handledNatively) {
    backingVocalInputRef.value?.click();
  }
}

function onBackingVocalSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    project.selectBackingVocalFile(file, undefined, false);
  }
  input.value = '';
}

async function handleBrowseBgImage() {
  const handledNatively = await project.browseBgImageFile();
  if (!handledNatively) {
    bgImageInputRef.value?.click();
  }
}

function onBgImageSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    project.selectBgImageFile(file);
  }
  input.value = '';
}
</script>

<template>
  <div ref="pageRef" class="h-full overflow-y-auto bg-white px-8 py-5">
    <div class="max-w-5xl mx-auto space-y-4">
      <!-- 1. Live Synchronized Karaoke Video Player -->
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center">
        <KaraokeRenderer :editable-box="false" :max-height-px="previewMaxHeightPx" />

        <!-- Player Scrubber & Transport Controls -->
        <div ref="transportControlsRef" class="w-full max-w-2xl mt-3 space-y-2.5">
          <div class="flex items-center gap-3">
            <button
              type="button"
              @click="project.togglePlay()"
              class="w-11 h-10 rounded-xl bg-brand-purple hover:bg-brand-purpleHover text-white flex items-center justify-center shadow-sm transition-colors cursor-pointer shrink-0"
              title="Play / Pause Preview"
            >
              <Pause v-if="project.isPlaying" class="w-5 h-5 fill-current" />
              <Play v-else class="w-5 h-5 fill-current ml-0.5" />
            </button>

            <input
              type="range"
              min="0"
              :max="Math.max(1, project.duration)"
              step="0.05"
              :value="project.currentTime"
              @input="project.seekAudio(Number(($event.target as HTMLInputElement).value))"
              class="flex-1 h-2 rounded-lg accent-brand-purple cursor-pointer"
            />

            <span class="font-mono text-base font-semibold text-slate-700 min-w-[100px] text-right">
              {{ formatClock(project.currentTime) }} / {{ formatClock(project.duration) }}
            </span>
          </div>

          <!-- Lyrics Offset + Audio Monitoring Switcher (Icon-Only) + Image Background Button -->
          <div class="flex flex-wrap items-center justify-center gap-2 pt-1">
            <!-- Full Lyrics Time Offset (-2.0s to +2.0s in 0.5s steps) -->
            <div class="flex items-center gap-1.5">
              <label for="lyrics-offset-select" class="text-sm font-semibold text-slate-600">
                Lyrics Offset:
              </label>
              <select
                id="lyrics-offset-select"
                :value="project.lyricsOffsetSec"
                @change="project.lyricsOffsetSec = Number(($event.target as HTMLSelectElement).value)"
                class="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm font-semibold text-slate-800 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple/30 cursor-pointer"
                title="Shift all lyrics timings earlier (-) or later (+)"
              >
                <option v-for="opt in offsetOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="h-5 w-px bg-slate-300 mx-1.5"></div>

            <span class="text-sm font-semibold text-slate-600 mr-1">Preview Audio:</span>

            <!-- Instrumental Only -->
            <div class="relative group">
              <button
                type="button"
                :disabled="!project.instrumentalFile"
                @click="project.setMixMode('instrumental')"
                class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :class="
                  project.mixMode === 'instrumental' && project.instrumentalFile
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                "
                aria-label="Instrumental Only"
              >
                <Music class="w-4 h-4" />
              </button>
              <div
                class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-30"
              >
                {{
                  project.instrumentalFile
                    ? project.backingVocalFile
                      ? 'Instrumental + Backing Vocals'
                      : 'Instrumental Only'
                    : 'Instrumental Only (attach track below)'
                }}
              </div>
            </div>

            <!-- Melody Guide Mix (Instrumental + Melody Guide) -->
            <div class="relative group">
              <button
                type="button"
                :disabled="
                  !project.instrumentalFile ||
                  !project.melodyGuideFile ||
                  project.isGeneratingMelodyGuide
                "
                @click="project.setMixMode('melody')"
                class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :class="
                  project.mixMode === 'melody' && project.instrumentalFile && project.melodyGuideFile
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                "
                aria-label="Melody Guide Mix"
              >
                <Loader2 v-if="project.isGeneratingMelodyGuide" class="w-4 h-4 animate-spin" />
                <AudioLines v-else class="w-4 h-4" />
              </button>
              <div
                class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-30"
              >
                {{
                  project.isGeneratingMelodyGuide
                    ? 'Generating Melody Guide…'
                    : !project.instrumentalFile
                      ? 'Melody Guide Mix (attach instrumental below)'
                      : project.melodyGuideFile && melodyStyleLabel
                        ? `Melody Guide Mix (${melodyStyleLabel})`
                        : 'Melody Guide Mix (select Flute or Synth below)'
                }}
              </div>
            </div>

            <!-- Guide Mix (Both) -->
            <div class="relative group">
              <button
                type="button"
                :disabled="!project.instrumentalFile"
                @click="project.setMixMode('mix')"
                class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                :class="
                  project.mixMode === 'mix' && project.instrumentalFile
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                "
                aria-label="Guide Mix (Both)"
              >
                <Headphones class="w-4 h-4" />
              </button>
              <div
                class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-30"
              >
                {{
                  project.instrumentalFile
                    ? 'Guide Mix (Both)'
                    : 'Guide Mix (attach track below)'
                }}
              </div>
            </div>

            <!-- Vocal Stem Only -->
            <div class="relative group">
              <button
                type="button"
                @click="project.setMixMode('vocal')"
                class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                :class="
                  project.mixMode === 'vocal' || !project.instrumentalFile
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                "
                aria-label="Vocal Stem Only"
              >
                <Mic class="w-4 h-4" />
              </button>
              <div
                class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-30"
              >
                Vocal Stem Only
              </div>
            </div>

            <div class="h-5 w-px bg-slate-300 mx-1.5"></div>

            <!-- Hidden file input fallback for browser mode -->
            <input
              ref="bgImageInputRef"
              type="file"
              accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp"
              class="hidden"
              @change="onBgImageSelect"
            />

            <!-- Add / Change Image Background Button -->
            <div class="relative group">
              <button
                type="button"
                @click="handleBrowseBgImage"
                class="w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                :class="
                  project.bgImageDataUrl
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                "
                aria-label="Add Image Background"
              >
                <ImagePlus class="w-4 h-4" />
              </button>
              <div
                class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-30"
              >
                {{
                  project.bgImageFileName
                    ? `Background: ${project.bgImageFileName} (Click to change)`
                    : 'Add Image Background'
                }}
              </div>
            </div>

            <!-- Clear Image Background Button (when active) -->
            <div v-if="project.bgImageDataUrl" class="relative group">
              <button
                type="button"
                @click="project.selectBgImageFile(null)"
                class="w-9 h-9 rounded-lg bg-white border border-slate-300 text-slate-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Remove Image Background"
              >
                <X class="w-4 h-4" />
              </button>
              <div
                class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-30"
              >
                Remove Image Background
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Backing Track & Export Cards -->
      <div ref="bottomCardsRef" class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Attach Instrumental, Backing Vocals & Melody Guide + Gain Panel -->
        <div class="lg:col-span-5 bg-white rounded-2xl shadow-card border border-slate-200 p-5 flex flex-col justify-start gap-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Music class="w-5 h-5 text-brand-purple" />
              <h3>Karaoke Backing Track</h3>
            </div>

            <!-- Slick [Gain] Toggle (switches card body between Files and Gain sliders) -->
            <button
              v-if="project.instrumentalFile"
              type="button"
              @click="backingPanelMode = backingPanelMode === 'gain' ? 'files' : 'gain'"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer shrink-0"
              :class="
                backingPanelMode === 'gain'
                  ? 'bg-brand-purple text-white shadow-sm'
                  : hasActiveGain
                    ? 'bg-purple-50 text-brand-purple border border-purple-300 hover:bg-purple-100'
                    : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/70'
              "
              :title="
                backingPanelMode === 'gain'
                  ? 'Back to backing track files'
                  : 'Adjust Instrumental, Backing & Melody Guide gain (dB)'
              "
            >
              <SlidersHorizontal class="w-3.5 h-3.5" />
              <span>Gain</span>
              <span
                v-if="hasActiveGain && backingPanelMode !== 'gain'"
                class="w-1.5 h-1.5 rounded-full bg-brand-purple"
              ></span>
            </button>
          </div>

          <input
            ref="instInputRef"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.ogg,.opus"
            class="hidden"
            @change="onInstSelect"
          />
          <input
            ref="backingVocalInputRef"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.ogg,.opus"
            class="hidden"
            @change="onBackingVocalSelect"
          />

          <!-- PANEL A: Files View -->
          <template v-if="!project.instrumentalFile || backingPanelMode === 'files'">
            <div class="space-y-2.5">
              <!-- Attached Instrumental + Optional Backing Vocals -->
              <template v-if="project.instrumentalFile">
                <!-- Instrumental Stem Pill -->
                <div
                  class="bg-emerald-50 border border-emerald-300 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Instrumental
                      </span>
                      <span
                        v-if="Math.abs(project.instrumentalGainDb) >= 0.05"
                        class="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-200/70 text-emerald-900"
                      >
                        {{ formatDb(project.instrumentalGainDb) }}
                      </span>
                    </div>
                    <div
                      class="text-sm font-semibold text-slate-900 truncate"
                      :title="project.instrumentalFilePath || project.instrumentalFileName"
                    >
                      {{ project.instrumentalFileName }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      @click="handleBrowseInstrumental"
                      class="px-2 py-1 rounded-md text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                      title="Change Instrumental Track"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      @click="project.selectInstrumentalFile(null)"
                      class="p-1 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Remove Instrumental Track"
                    >
                      <X class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Optional Backing Vocals Pill -->
                <div
                  v-if="project.backingVocalFile"
                  class="bg-purple-50/70 border border-purple-200 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                >
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="text-[11px] font-bold uppercase tracking-wider text-brand-purple">
                        Backing Vocals
                      </span>
                      <span
                        v-if="project.backingVocalAutoDetected"
                        class="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-purple-200/70 text-purple-900"
                      >
                        Auto
                      </span>
                      <span
                        v-if="Math.abs(project.backingVocalGainDb) >= 0.05"
                        class="text-[11px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-200/70 text-purple-900"
                      >
                        {{ formatDb(project.backingVocalGainDb) }}
                      </span>
                    </div>
                    <div
                      class="text-sm font-semibold text-slate-900 truncate"
                      :title="project.backingVocalFilePath || project.backingVocalFileName"
                    >
                      {{ project.backingVocalFileName }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      @click="handleBrowseBackingVocal"
                      class="px-2 py-1 rounded-md text-xs font-semibold text-brand-purple hover:bg-purple-100 transition-colors cursor-pointer"
                      title="Change Backing Vocals Stem"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      @click="project.selectBackingVocalFile(null)"
                      class="p-1 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Remove Backing Vocals Stem"
                    >
                      <X class="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <!-- Compact Add Optional Backing Vocals button -->
                <button
                  v-else
                  type="button"
                  @click="handleBrowseBackingVocal"
                  class="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 hover:bg-purple-50/50 hover:border-purple-300 text-slate-600 hover:text-brand-purple font-semibold text-sm py-2 px-3 transition-colors cursor-pointer"
                >
                  <Upload class="w-4 h-4" />
                  <span>+ Attach Backing Vocals (Optional)</span>
                </button>
              </template>

              <!-- Initial Attach Instrumental CTA (when no instrumental attached yet) -->
              <button
                v-else
                type="button"
                @click="handleBrowseInstrumental"
                class="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 hover:bg-purple-50 text-brand-purple font-semibold text-base py-3 px-4 transition-colors cursor-pointer"
              >
                <Upload class="w-5 h-5" />
                <span>+ Attach Instrumental Track</span>
              </button>

              <!-- Melody Guide Selector stacked cleanly right below Backing Vocals -->
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <div class="relative flex-1 min-w-0">
                    <AudioLines
                      class="w-4 h-4 text-brand-purple absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                    <select
                      :value="project.melodyGuideStyle"
                      :disabled="project.isGeneratingMelodyGuide || !project.vocalFile"
                      @change="onMelodyStyleChange"
                      aria-label="Melody Guide Instrument"
                      class="appearance-none w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-sm font-semibold text-slate-800 hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-brand-purple/30 cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
                    >
                      <option value="none">No Melody Guide</option>
                      <option value="flute">Flute Melody Guide</option>
                      <option value="synth">Synth Melody Guide</option>
                    </select>
                    <ChevronDown
                      class="w-4 h-4 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    />
                  </div>

                  <span
                    v-if="project.isGeneratingMelodyGuide"
                    class="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-purple shrink-0"
                  >
                    <Loader2 class="w-3.5 h-3.5 animate-spin" />
                    <span>Generating…</span>
                  </span>
                  <span
                    v-else-if="project.melodyGuideFile && project.melodyGuideStyle !== 'none'"
                    class="text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-purple-100 text-brand-purple shrink-0"
                    title="Melody Guide Gain (adjust in Gain tab)"
                  >
                    {{ formatDb(project.melodyGuideGainDb) }}
                  </span>
                </div>

                <div
                  v-if="project.melodyGuideError"
                  class="bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs text-amber-950"
                >
                  {{ project.melodyGuideError }}
                </div>
              </div>
            </div>
          </template>

          <!-- PANEL B: Gain Sliders View -->
          <div v-else class="space-y-2.5">
            <!-- Instrumental Gain Slider (-6 dB to +6 dB) -->
            <div class="space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Instrumental Gain
                </label>
                <button
                  type="button"
                  @click="project.setInstrumentalGainDb(0)"
                  class="font-mono text-xs font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  :class="
                    project.instrumentalGainDb >= 3
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : Math.abs(project.instrumentalGainDb) >= 0.05
                        ? 'bg-purple-100 text-brand-purple hover:bg-purple-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  "
                  :title="
                    project.instrumentalGainDb >= 3
                      ? 'Clipping protection active (≥ +3 dB) · Click to reset to 0 dB'
                      : 'Click to reset to 0 dB'
                  "
                >
                  {{ formatDb(project.instrumentalGainDb) }}
                </button>
              </div>
              <input
                type="range"
                min="-6"
                max="6"
                step="0.1"
                :value="project.instrumentalGainDb"
                @input="onInstrumentalGainInput"
                class="w-full h-2 rounded-lg accent-brand-purple cursor-pointer"
              />
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <button
                  v-for="stop in [-6, -3, 0, 1, 3, 6]"
                  :key="stop"
                  type="button"
                  @click="project.setInstrumentalGainDb(stop)"
                  class="px-1 rounded hover:text-brand-purple transition-colors cursor-pointer"
                  :class="
                    Math.abs(project.instrumentalGainDb - stop) < 0.05
                      ? stop >= 3
                        ? 'text-amber-600 font-bold'
                        : 'text-brand-purple font-bold'
                      : ''
                  "
                >
                  {{ stop > 0 ? `+${stop}` : stop }}
                </button>
              </div>
            </div>

            <!-- Backing Vocals Gain Slider (-12 dB to +6 dB) -->
            <div class="space-y-1" :class="{ 'opacity-45': !project.backingVocalFile }">
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Backing Vocals Gain
                </label>
                <button
                  v-if="project.backingVocalFile"
                  type="button"
                  @click="project.setBackingVocalGainDb(0)"
                  class="font-mono text-xs font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  :class="
                    project.backingVocalGainDb >= 3
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : Math.abs(project.backingVocalGainDb) >= 0.05
                        ? 'bg-purple-100 text-brand-purple hover:bg-purple-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  "
                  :title="
                    project.backingVocalGainDb >= 3
                      ? 'Clipping protection active (≥ +3 dB) · Click to reset to 0 dB'
                      : 'Click to reset to 0 dB'
                  "
                >
                  {{ formatDb(project.backingVocalGainDb) }}
                </button>
                <span v-else class="text-[11px] font-medium text-slate-400">Not attached</span>
              </div>
              <input
                type="range"
                min="-12"
                max="6"
                step="0.1"
                :disabled="!project.backingVocalFile"
                :value="project.backingVocalGainDb"
                @input="onBackingGainInput"
                class="w-full h-2 rounded-lg accent-brand-purple cursor-pointer disabled:cursor-not-allowed"
              />
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <button
                  v-for="stop in [-12, -6, -3, 0, 3, 6]"
                  :key="stop"
                  type="button"
                  :disabled="!project.backingVocalFile"
                  @click="project.setBackingVocalGainDb(stop)"
                  class="px-1 rounded hover:text-brand-purple transition-colors cursor-pointer disabled:cursor-not-allowed"
                  :class="
                    project.backingVocalFile && Math.abs(project.backingVocalGainDb - stop) < 0.05
                      ? stop >= 3
                        ? 'text-amber-600 font-bold'
                        : 'text-brand-purple font-bold'
                      : ''
                  "
                >
                  {{ stop > 0 ? `+${stop}` : stop }}
                </button>
              </div>
            </div>

            <!-- Melody Guide Gain Slider (-9 dB to +3 dB, default -3 dB = barely audible) -->
            <div
              class="space-y-1"
              :class="{
                'opacity-45': !project.melodyGuideFile || project.melodyGuideStyle === 'none',
              }"
            >
              <div class="flex items-center justify-between">
                <label class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Melody Guide Gain
                </label>
                <button
                  v-if="project.melodyGuideFile && project.melodyGuideStyle !== 'none'"
                  type="button"
                  @click="project.setMelodyGuideGainDb(-3)"
                  class="font-mono text-xs font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                  :class="
                    project.melodyGuideGainDb >= 3
                      ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      : Math.abs(project.melodyGuideGainDb - -3) >= 0.05
                        ? 'bg-purple-100 text-brand-purple hover:bg-purple-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  "
                  title="Default subtle guide (-3 dB) · Click to reset"
                >
                  {{ formatDb(project.melodyGuideGainDb) }}
                </button>
                <span v-else class="text-[11px] font-medium text-slate-400">Off</span>
              </div>
              <input
                type="range"
                min="-9"
                max="3"
                step="0.1"
                :disabled="!project.melodyGuideFile || project.melodyGuideStyle === 'none'"
                :value="project.melodyGuideGainDb"
                @input="onMelodyGainInput"
                class="w-full h-2 rounded-lg accent-brand-purple cursor-pointer disabled:cursor-not-allowed"
              />
              <div class="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <button
                  v-for="stop in [-9, -6, -3, 0, 3]"
                  :key="stop"
                  type="button"
                  :disabled="!project.melodyGuideFile || project.melodyGuideStyle === 'none'"
                  @click="project.setMelodyGuideGainDb(stop)"
                  class="px-1 rounded hover:text-brand-purple transition-colors cursor-pointer disabled:cursor-not-allowed"
                  :class="
                    project.melodyGuideFile &&
                    project.melodyGuideStyle !== 'none' &&
                    Math.abs(project.melodyGuideGainDb - stop) < 0.05
                      ? stop >= 3
                        ? 'text-amber-600 font-bold'
                        : 'text-brand-purple font-bold'
                      : ''
                  "
                >
                  {{ stop > 0 ? `+${stop}` : stop }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Render MP4 & Download Subtitles -->
        <div class="lg:col-span-7 bg-white rounded-2xl shadow-card border border-slate-200 p-5 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Film class="w-5 h-5 text-brand-purple" />
              <h3>Generate Karaoke Video (.MP4)</h3>
            </div>
            <span class="text-sm font-medium text-slate-500">
              Aspect {{ project.options.aspectRatio }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Resolution -->
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1.5">Resolution</label>
              <select
                v-model="renderQuality"
                class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-medium text-slate-900"
              >
                <option value="1080p">1080p Full HD (Recommended)</option>
                <option value="720p">720p Fast Render</option>
              </select>
            </div>

            <!-- Export Audio Source -->
            <div>
              <label class="block text-sm font-semibold text-slate-700 mb-1.5">Audio Track in Video</label>
              <select
                v-model="exportAudioChoice"
                class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-medium text-slate-900"
              >
                <option
                  v-if="project.instrumentalFile && project.melodyGuideFile && melodyStyleLabel"
                  value="melody"
                >
                  {{
                    project.backingVocalFile
                      ? `Instrumental + Backing + ${melodyStyleLabel} Guide`
                      : `Instrumental + ${melodyStyleLabel} Guide (Karaoke)`
                  }}
                </option>
                <option v-if="project.instrumentalFile" value="instrumental">
                  {{
                    project.backingVocalFile
                      ? 'Instrumental + Backing Vocals (Karaoke)'
                      : 'Instrumental Stem (Pure Karaoke)'
                  }}
                </option>
                <option value="vocal">
                  Vocal Stem ({{ project.vocalFileName || 'Current Track' }})
                </option>
              </select>
            </div>
          </div>

          <!-- Render CTA -->
          <button
            type="button"
            :disabled="project.isRenderingMp4 || project.lines.length === 0"
            @click="project.renderMp4Video(renderQuality, exportAudioChoice)"
            class="w-full rounded-xl py-3.5 px-6 bg-brand-purple hover:bg-brand-purpleHover disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-lg shadow-sm transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Loader2 v-if="project.isRenderingMp4" class="w-5 h-5 animate-spin" />
            <Film v-else class="w-5 h-5" />
            <span>
              {{
                project.isRenderingMp4
                  ? 'Rendering MP4 Video via FFmpeg...'
                  : `Render ${renderQuality} Karaoke MP4`
              }}
            </span>
          </button>

          <!-- Render Success Banner -->
          <div
            v-if="project.lastExportedMp4Path"
            class="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
          >
            <div class="flex items-start gap-2.5 min-w-0 flex-1">
              <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div class="min-w-0">
                <div class="font-bold text-base text-emerald-950">Video Saved to Downloads!</div>
                <div class="text-sm font-mono text-emerald-800 break-all mt-0.5">
                  {{ project.lastExportedMp4Path }}
                </div>
              </div>
            </div>
            <button
              type="button"
              @click="project.revealLastMp4InFinder()"
              class="inline-flex items-center gap-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-400 font-semibold text-sm px-3.5 py-2 rounded-lg transition-colors"
            >
              <FolderOpen class="w-4 h-4" />
              <span>Show in Finder</span>
            </button>
          </div>

          <!-- Render Error / Info -->
          <div
            v-if="project.exportError"
            class="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm text-amber-950 whitespace-pre-line"
          >
            {{ project.exportError }}
          </div>

          <!-- Subtitle Exports -->
          <div class="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-3">
            <button
              type="button"
              @click="project.exportAssFile()"
              class="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-base py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
            >
              <FileCode class="w-4 h-4 text-brand-purple" />
              <span>Export .ASS Karaoke</span>
            </button>
            <button
              type="button"
              @click="project.exportLrcFile()"
              class="flex-1 inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold text-base py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
            >
              <FileText class="w-4 h-4 text-sky-600" />
              <span>Export .LRC Lyrics</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
