<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { useProjectStore } from '../stores/projectStore';
import {
  CheckCircle2,
  Loader2,
  Eraser,
  CaseSensitive,
  CaseUpper,
  Zap,
  Music,
  Mic,
  Sparkles,
} from '@lucide/vue';

const project = useProjectStore();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
let unlistenDragDrop: UnlistenFn | null = null;

const AUDIO_EXT_RE = /\.(wav|mp3|m4a|flac|aac|ogg|opus|mp4|mov|mkv|webm|aif|aiff)$/i;

onMounted(async () => {
  if (!project.isTauriEnv) return;
  try {
    unlistenDragDrop = await getCurrentWebview().onDragDropEvent(async (event) => {
      if (project.isBusySubmitting) return;
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') {
        isDragging.value = true;
      } else if (type === 'leave') {
        isDragging.value = false;
      } else if (type === 'drop') {
        isDragging.value = false;
        const paths = event.payload.paths;
        if (!paths || paths.length === 0) return;
        const audioPath = paths.find((p) => AUDIO_EXT_RE.test(p)) || paths[0];
        if (audioPath) {
          await project.loadVocalFromPath(audioPath);
        }
      }
    });
  } catch {
    // Ignore outside Tauri
  }
});

onBeforeUnmount(() => {
  unlistenDragDrop?.();
});

function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function handleBrowseVocal() {
  const handledNatively = await project.browseVocalFile();
  if (!handledNatively) {
    fileInputRef.value?.click();
  }
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await project.selectVocalFile(file);
  }
  input.value = '';
}

async function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    await project.selectVocalFile(file);
  }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-white px-8 py-5">
    <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:items-stretch">
      <!-- Left Column (50%): Step 1 (Select Vocal Stem) & Step 2 (Title & Artist) -->
      <div class="flex flex-col justify-between gap-5">
        <!-- 1. Select Song Audio -->
        <section>
          <div class="text-center mb-2">
            <h2 class="text-2xl font-bold text-slate-900">1. Select Song Audio</h2>
            <p class="text-sm font-medium text-slate-700 mt-0.5">
              Drop a full song or isolated vocal stem
            </p>
          </div>

          <div class="bg-white rounded-3xl shadow-card border border-slate-200/90 p-4">
            <input
              ref="fileInputRef"
              type="file"
              accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.aac,.ogg,.mp4"
              class="hidden"
              @change="handleFileSelect"
            />

            <div
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
              class="rounded-2xl border-2 border-dashed transition-all p-4 text-center flex flex-col items-center justify-center min-h-[140px]"
              :class="
                isDragging
                  ? 'border-brand-purple bg-purple-50/70'
                  : project.vocalFile
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-slate-300 bg-slate-50/40 hover:border-slate-400'
              "
            >
              <!-- Decoding Spinner -->
              <div v-if="project.isDecodingAudio" class="space-y-2 py-1">
                <Loader2 class="w-8 h-8 text-brand-purple animate-spin mx-auto" />
                <p class="text-base font-semibold text-slate-800">Analyzing audio waveform...</p>
              </div>

              <!-- Loaded File State -->
              <div v-else-if="project.vocalFile" class="space-y-1.5 w-full">
                <CheckCircle2 class="w-7 h-7 text-emerald-600 mx-auto" />
                <div class="font-bold text-base text-slate-900 truncate px-2">
                  {{ project.vocalFileName }}
                </div>
                <div
                  v-if="project.vocalFilePath"
                  class="text-xs text-slate-500 font-mono truncate px-3"
                  :title="project.vocalFilePath"
                >
                  {{ project.vocalFilePath }}
                </div>
                <div class="text-sm text-slate-600 font-medium">
                  Duration: {{ formatDuration(project.duration) }}
                </div>
                <div class="pt-0.5">
                  <button
                    type="button"
                    :disabled="project.isBusySubmitting"
                    @click="handleBrowseVocal"
                    class="bg-brand-purple hover:bg-brand-purpleHover disabled:opacity-50 text-white font-semibold text-sm px-5 py-2 rounded-xl shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed"
                  >
                    Change File
                  </button>
                </div>
              </div>

              <!-- Empty Dropzone State -->
              <div v-else class="space-y-2.5">
                <button
                  type="button"
                  @click="handleBrowseVocal"
                  class="bg-brand-purple hover:bg-brand-purpleHover text-white font-semibold text-base px-8 py-2.5 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  Browse
                </button>
                <div class="text-sm text-slate-500 leading-snug">
                  <div>Drop Song or Vocal Audio</div>
                  <div class="text-xs text-slate-400 mt-0.5">(.wav, .mp3, .m4a, .flac, ...)</div>
                </div>
              </div>
            </div>

            <!-- Audio Error Banner -->
            <p v-if="project.audioError" class="mt-2 text-xs font-medium text-red-600 text-center">
              {{ project.audioError }}
            </p>

            <!-- Contextual Built-In Stem Extraction Bar -->
            <!-- State A: Empty (before file loaded) -->
            <div
              v-if="!project.vocalFile"
              class="mt-3 bg-purple-50/80 border border-purple-200/80 rounded-xl px-4 py-2.5 flex items-center gap-2.5"
            >
              <Sparkles class="w-4 h-4 text-brand-purple shrink-0" />
              <div class="text-xs text-slate-700 leading-snug">
                <strong class="text-slate-900">Built-in AI Stem Extraction (MDX-Net &amp; BS-Roformer):</strong>
                Drop any full song — KaraoCraft auto-detects and extracts Lead Vocals &amp; Backing tracks locally.
              </div>
            </div>

            <!-- State B: Full Song Detected (or user chose to separate) -> FAST / MAX Toggle -->
            <div
              v-else-if="project.needsStemSeparation"
              class="mt-3 bg-purple-50/75 border border-purple-200/90 rounded-xl p-3 space-y-2.5"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Music class="w-3.5 h-3.5 text-brand-purple shrink-0" />
                  <span>
                    {{
                      project.detectedAudioType === 'full_mix'
                        ? 'Full Song Detected · Auto-Extract Stems'
                        : 'AI Stem Extraction Enabled'
                    }}
                  </span>
                </div>
                <button
                  type="button"
                  :disabled="project.isBusySubmitting"
                  @click="project.needsStemSeparation = false"
                  class="text-[11px] font-semibold text-slate-500 hover:text-brand-purple underline underline-offset-2 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  Already vocals? Skip
                </button>
              </div>

              <!-- FAST / MAX Segmented Toggle (narrower FAST, wider MAX so both stay cleanly on 2 lines) -->
              <div class="grid grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] gap-2">
                <button
                  type="button"
                  :disabled="project.isBusySubmitting"
                  @click="project.separationQuality = 'fast'"
                  class="rounded-xl px-3 py-2 text-left transition-all border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-w-0"
                  :class="
                    project.separationQuality === 'fast'
                      ? 'bg-brand-purple text-white border-brand-purple shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                  "
                >
                  <div class="flex items-center gap-1.5 font-bold text-xs tracking-wide">
                    <Zap class="w-3.5 h-3.5 shrink-0" />
                    <span>FAST</span>
                  </div>
                  <div
                    class="text-[11px] mt-0.5 leading-tight whitespace-nowrap truncate"
                    :class="project.separationQuality === 'fast' ? 'text-purple-100' : 'text-slate-500'"
                  >
                    MDX-Net Karaoke 2 · Quick
                  </div>
                </button>

                <button
                  type="button"
                  :disabled="project.isBusySubmitting"
                  @click="project.separationQuality = 'max'"
                  class="rounded-xl px-3 py-2 text-left transition-all border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-w-0"
                  :class="
                    project.separationQuality === 'max'
                      ? 'bg-brand-purple text-white border-brand-purple shadow-sm'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                  "
                >
                  <div class="flex items-center gap-1.5 font-bold text-xs tracking-wide">
                    <Music class="w-3.5 h-3.5 shrink-0" />
                    <span>MAX</span>
                  </div>
                  <div
                    class="text-[11px] mt-0.5 leading-tight whitespace-nowrap truncate"
                    :class="project.separationQuality === 'max' ? 'text-purple-100' : 'text-slate-500'"
                  >
                    BS-Roformer · 3 Stems (Inst + Backing)
                  </div>
                </button>
              </div>
            </div>

            <!-- State C: Isolated Vocal Detected (or separation skipped) -->
            <div
              v-else
              class="mt-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2"
            >
              <div class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                <Mic class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {{
                    project.detectedAudioType === 'isolated_vocal'
                      ? 'Isolated Vocal Detected · Ready to sync'
                      : 'Stem extraction skipped · Using audio directly'
                  }}
                </span>
              </div>
              <button
                type="button"
                :disabled="project.isBusySubmitting"
                @click="project.needsStemSeparation = true"
                class="text-[11px] font-bold text-brand-purple hover:underline underline-offset-2 transition-colors cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
              >
                Separate stems
              </button>
            </div>

            <!-- Separation Error Banner -->
            <div
              v-if="project.separationError"
              class="mt-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3.5 py-2 text-xs text-amber-950 whitespace-pre-line"
            >
              {{ project.separationError }}
            </div>
          </div>
        </section>

        <!-- 2. Add Title & Artist -->
        <section>
          <div class="text-center mb-2">
            <h2 class="text-2xl font-bold text-slate-900">2. Add Title &amp; Artist</h2>
          </div>

          <div class="bg-white rounded-3xl shadow-card border border-slate-200/90 p-5 space-y-3.5">
            <div>
              <label for="setup-title" class="block text-center text-base font-semibold text-slate-800 mb-1.5">
                Title
              </label>
              <input
                id="setup-title"
                v-model="project.title"
                type="text"
                placeholder="Song Title"
                class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>

            <div>
              <label for="setup-artist" class="block text-center text-base font-semibold text-slate-800 mb-1.5">
                Artist
              </label>
              <input
                id="setup-artist"
                v-model="project.artist"
                type="text"
                placeholder="Artist Name"
                class="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
          </div>
        </section>
      </div>

      <!-- Right Column (50%): Step 3 (Paste Lyrics + Submit aligned with left column bottom) -->
      <div class="flex flex-col justify-between">
        <div class="text-center mb-2">
          <h2 class="text-2xl font-bold text-slate-900">3. Paste Lyrics</h2>
          <p class="text-sm font-medium text-slate-700 mt-0.5">
            *Do NOT forget lyrics that repeat
          </p>
        </div>

        <div class="bg-white rounded-3xl shadow-card border border-slate-200/90 p-4 flex-1 flex flex-col">
          <div class="flex items-center justify-between gap-2 mb-2.5">
            <span class="text-xs font-medium text-slate-500 whitespace-nowrap truncate">
              Blank lines separate karaoke screen frames
            </span>

            <div class="flex items-center gap-1.5 shrink-0">
              <!-- Sentence case icon button with hover popover -->
              <div class="relative group">
                <button
                  type="button"
                  @click="project.toSentenceCaseLyrics()"
                  aria-label="Sentence case"
                  class="inline-flex items-center justify-center text-slate-600 hover:text-brand-purple bg-slate-100 hover:bg-purple-50 border border-slate-200/80 hover:border-purple-200 p-1.5 rounded-lg transition-colors"
                >
                  <CaseSensitive class="w-4 h-4" />
                </button>
                <div
                  class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-md z-20"
                >
                  Sentence case
                </div>
              </div>

              <!-- Uppercase icon button with hover popover -->
              <div class="relative group">
                <button
                  type="button"
                  @click="project.toUpperCaseLyrics()"
                  aria-label="Uppercase"
                  class="inline-flex items-center justify-center text-slate-600 hover:text-brand-purple bg-slate-100 hover:bg-purple-50 border border-slate-200/80 hover:border-purple-200 p-1.5 rounded-lg transition-colors"
                >
                  <CaseUpper class="w-4 h-4" />
                </button>
                <div
                  class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-md z-20"
                >
                  Uppercase
                </div>
              </div>

              <!-- Remove [Tags] icon button with hover popover -->
              <div class="relative group">
                <button
                  type="button"
                  @click="project.stripSectionHeaders()"
                  aria-label="Remove [Tags]"
                  class="inline-flex items-center justify-center text-slate-600 hover:text-brand-purple bg-slate-100 hover:bg-purple-50 border border-slate-200/80 hover:border-purple-200 p-1.5 rounded-lg transition-colors"
                >
                  <Eraser class="w-4 h-4" />
                </button>
                <div
                  class="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full right-0 mb-1.5 px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-md z-20"
                >
                  Remove [Tags]
                </div>
              </div>
            </div>
          </div>

          <textarea
            v-model="project.rawLyrics"
            rows="10"
            placeholder="Paste full song lyrics here (one phrase per line, blank line between verses)..."
            class="w-full flex-1 rounded-xl border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple resize-none min-h-[235px]"
          ></textarea>
        </div>

        <div class="mt-4">
          <button
            type="button"
            :disabled="!project.canSubmit || project.isBusySubmitting"
            @click="project.submitSetup()"
            class="relative overflow-hidden w-full rounded-2xl py-3 px-6 text-lg font-bold shadow-md transition-all flex items-center justify-center"
            :class="
              project.isBusySubmitting
                ? 'bg-slate-400/90 text-white cursor-wait shadow-sm'
                : project.canSubmit
                  ? 'bg-brand-purple hover:bg-brand-purpleHover text-white cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
            "
          >
            <!-- Croonify-style vibrant linear progress fill over muted disabled track -->
            <div
              v-if="project.isBusySubmitting"
              class="absolute inset-y-0 left-0 bg-brand-purple transition-[width] duration-300 ease-out"
              :style="{ width: `${Math.max(4, Math.min(100, project.submitProgress))}%` }"
            ></div>

            <!-- Foreground label + circular spinner + pinned percentage -->
            <span class="relative z-10 flex items-center justify-center gap-2.5 max-w-full">
              <Loader2 v-if="project.isBusySubmitting" class="w-5 h-5 animate-spin shrink-0" />
              <span class="truncate">
                {{
                  project.isBusySubmitting
                    ? project.submitStatusMessage || project.alignmentMessage || 'Processing…'
                    : project.needsStemSeparation
                      ? `Extract (${project.separationQuality.toUpperCase()}) & Submit`
                      : 'Submit'
                }}
              </span>
              <span
                v-if="project.isBusySubmitting"
                class="shrink-0 tabular-nums text-white/95 font-bold"
              >
                {{ Math.round(project.submitProgress) }}%
              </span>
            </span>
          </button>
          <p
            class="text-center text-xs text-slate-500 mt-1.5 whitespace-nowrap truncate"
            :class="!project.vocalFile || !project.rawLyrics.trim() ? 'opacity-100' : 'opacity-0 select-none'"
          >
            Select a song or vocal audio file and paste lyrics above to continue.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
