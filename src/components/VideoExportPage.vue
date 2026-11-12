<script setup lang="ts">
import { ref, watch } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import KaraokeRenderer from './KaraokeRenderer.vue';
import {
  Play,
  Pause,
  Film,
  Music,
  FileCode,
  FileText,
  FolderOpen,
  Loader2,
  CheckCircle2,
  X,
  Upload,
} from '@lucide/vue';

const project = useProjectStore();

const instInputRef = ref<HTMLInputElement | null>(null);
const renderQuality = ref<'1080p' | '720p'>('1080p');
const exportAudioChoice = ref<'instrumental' | 'vocal'>(
  project.instrumentalFile ? 'instrumental' : 'vocal'
);

watch(
  () => project.instrumentalFile,
  (file) => {
    exportAudioChoice.value = file ? 'instrumental' : 'vocal';
  }
);

function formatClock(sec: number): string {
  const clamped = Math.max(0, sec || 0);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function onInstSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    project.selectInstrumentalFile(file);
  }
  input.value = '';
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-white px-8 py-6">
    <div class="max-w-5xl mx-auto space-y-6">
      <!-- 1. Live Synchronized Karaoke Video Player -->
      <div class="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center">
        <KaraokeRenderer :editable-box="false" :max-height-px="330" />

        <!-- Player Scrubber & Transport Controls -->
        <div class="w-full max-w-2xl mt-4 space-y-3">
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

          <!-- Audio Monitoring Switcher (when Instrumental is attached) -->
          <div v-if="project.instrumentalFile" class="flex items-center justify-center gap-2 pt-1">
            <span class="text-sm font-semibold text-slate-600 mr-1">Preview Audio:</span>
            <button
              type="button"
              @click="project.setMixMode('instrumental')"
              class="px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              :class="
                project.mixMode === 'instrumental'
                  ? 'bg-brand-purple text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              "
            >
              Instrumental Only
            </button>
            <button
              type="button"
              @click="project.setMixMode('mix')"
              class="px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              :class="
                project.mixMode === 'mix'
                  ? 'bg-brand-purple text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              "
            >
              Guide Mix (Both)
            </button>
            <button
              type="button"
              @click="project.setMixMode('vocal')"
              class="px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              :class="
                project.mixMode === 'vocal'
                  ? 'bg-brand-purple text-white'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
              "
            >
              Vocal Stem Only
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Backing Track & Export Cards -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Attach UVR Instrumental Backing Track -->
        <div class="lg:col-span-5 bg-white rounded-2xl shadow-card border border-slate-200 p-6 flex flex-col justify-between space-y-4">
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Music class="w-5 h-5 text-brand-purple" />
              <h3>Karaoke Backing Track</h3>
            </div>
            <p class="text-base text-slate-600 leading-relaxed">
              Attach your <strong>Instrumental Stem</strong> (from UVR5) to export a true vocal-free karaoke video, or render using your current Vocal Stem.
            </p>
          </div>

          <input
            ref="instInputRef"
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.flac,.aac,.ogg"
            class="hidden"
            @change="onInstSelect"
          />

          <div
            v-if="project.instrumentalFile"
            class="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex items-center justify-between gap-3"
          >
            <div class="min-w-0">
              <div class="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Instrumental Ready
              </div>
              <div class="text-base font-semibold text-slate-900 truncate">
                {{ project.instrumentalFileName }}
              </div>
            </div>
            <button
              type="button"
              @click="project.selectInstrumentalFile(null)"
              class="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              title="Remove Instrumental Track"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <button
            type="button"
            @click="instInputRef?.click()"
            class="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 hover:bg-purple-50 text-brand-purple font-semibold text-base py-3 px-4 transition-colors cursor-pointer"
          >
            <Upload class="w-5 h-5" />
            <span>{{ project.instrumentalFile ? 'Change Instrumental Track' : '+ Attach Instrumental Track (UVR)' }}</span>
          </button>
        </div>

        <!-- Render MP4 & Download Subtitles -->
        <div class="lg:col-span-7 bg-white rounded-2xl shadow-card border border-slate-200 p-6 space-y-5">
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
                <option v-if="project.instrumentalFile" value="instrumental">
                  Instrumental Stem (Pure Karaoke)
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
