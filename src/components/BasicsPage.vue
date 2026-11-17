<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { RefreshCw, Eraser, Upload, CaseSensitive, CaseUpper } from '@lucide/vue';

const project = useProjectStore();
const vocalInputRef = ref<HTMLInputElement | null>(null);

async function handleBrowseVocal() {
  const handledNatively = await project.browseVocalFile();
  if (!handledNatively) {
    vocalInputRef.value?.click();
  }
}

async function onVocalChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    await project.selectVocalFile(file);
  }
  input.value = '';
}
</script>

<template>
  <div class="h-full overflow-hidden bg-white px-8 py-5 flex flex-col">
    <div class="max-w-4xl w-full flex-1 min-h-0 flex flex-col gap-4">
      <!-- Lyrics Changed Banner -->
      <div
        v-if="project.lyricsModifiedSinceSync"
        class="shrink-0 bg-amber-50 border border-amber-300 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
      >
        <div class="text-base text-amber-950">
          <strong>Lyrics were edited.</strong> Re-align timings so Line & Word Timings match your updated lyrics.
        </div>
        <button
          type="button"
          @click="project.runFullAlignment()"
          class="inline-flex items-center gap-2 bg-brand-purple hover:bg-brand-purpleHover text-white font-semibold text-base px-5 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <RefreshCw class="w-4 h-4" />
          <span>Apply & Re-Sync Lyrics</span>
        </button>
      </div>

      <!-- Title -->
      <div class="shrink-0">
        <label for="basics-title" class="block text-xl font-bold text-slate-800 mb-1.5">
          Title
        </label>
        <input
          id="basics-title"
          v-model="project.title"
          type="text"
          placeholder="Song Title"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        />
      </div>

      <!-- Artist -->
      <div class="shrink-0">
        <label for="basics-artist" class="block text-xl font-bold text-slate-800 mb-1.5">
          Artist
        </label>
        <input
          id="basics-artist"
          v-model="project.artist"
          type="text"
          placeholder="Artist Name"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        />
      </div>

      <!-- Vocal Stem Source Row -->
      <div class="shrink-0 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div class="text-base text-slate-700 min-w-0 flex-1">
          <div>
            <span class="font-semibold text-slate-900">Vocal Stem:</span>
            <span class="ml-2">{{ project.vocalFileName || 'No audio file loaded' }}</span>
          </div>
          <div v-if="project.vocalFilePath" class="text-xs text-slate-500 font-mono truncate mt-0.5" :title="project.vocalFilePath">
            Path: {{ project.vocalFilePath }}
          </div>
          <div v-if="project.audioError" class="text-xs font-medium text-red-600 mt-1">
            {{ project.audioError }}
          </div>
        </div>
        <div>
          <input
            ref="vocalInputRef"
            type="file"
            accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.aac,.ogg,.mp4"
            class="hidden"
            @change="onVocalChange"
          />
          <button
            type="button"
            @click="handleBrowseVocal"
            class="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-sm px-3.5 py-2 rounded-lg transition-colors"
          >
            <Upload class="w-4 h-4" />
            <span>Replace Vocal File</span>
          </button>
        </div>
      </div>

      <!-- Lyrics (dynamically fills remaining viewport height -> single scrollbar only inside textarea) -->
      <div class="flex-1 min-h-0 flex flex-col">
        <div class="shrink-0 flex items-center justify-between mb-1.5">
          <label for="basics-lyrics" class="text-xl font-bold text-slate-800">
            Lyrics
          </label>
          <div class="flex items-center gap-1.5">
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
          id="basics-lyrics"
          v-model="project.rawLyrics"
          placeholder="Enter song lyrics (blank line between screen stanzas)..."
          class="flex-1 min-h-[120px] w-full rounded-xl border border-slate-400 bg-white p-4 text-lg font-mono leading-relaxed text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple resize-none"
        ></textarea>
      </div>
    </div>
  </div>
</template>
