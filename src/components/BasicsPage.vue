<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { RefreshCw, Eraser, Upload } from '@lucide/vue';

const project = useProjectStore();
const vocalInputRef = ref<HTMLInputElement | null>(null);

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
  <div class="h-full overflow-y-auto bg-white px-8 py-6">
    <div class="max-w-4xl space-y-6">
      <!-- Lyrics Changed Banner -->
      <div
        v-if="project.lyricsModifiedSinceSync"
        class="bg-amber-50 border border-amber-300 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4"
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
      <div>
        <label for="basics-title" class="block text-xl font-bold text-slate-800 mb-2">
          Title
        </label>
        <input
          id="basics-title"
          v-model="project.title"
          type="text"
          placeholder="Song Title"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        />
      </div>

      <!-- Artist -->
      <div>
        <label for="basics-artist" class="block text-xl font-bold text-slate-800 mb-2">
          Artist
        </label>
        <input
          id="basics-artist"
          v-model="project.artist"
          type="text"
          placeholder="Artist Name"
          class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
        />
      </div>

      <!-- Vocal Stem Source Row -->
      <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div class="text-base text-slate-700">
          <span class="font-semibold text-slate-900">Vocal Stem:</span>
          <span class="ml-2">{{ project.vocalFileName || 'No audio file loaded' }}</span>
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
            @click="vocalInputRef?.click()"
            class="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-sm px-3.5 py-2 rounded-lg transition-colors"
          >
            <Upload class="w-4 h-4" />
            <span>Replace Vocal File</span>
          </button>
        </div>
      </div>

      <!-- Lyrics -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label for="basics-lyrics" class="text-xl font-bold text-slate-800">
            Lyrics
          </label>
          <button
            type="button"
            @click="project.stripSectionHeaders()"
            class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Eraser class="w-4 h-4" />
            <span>Strip [Chorus/Verse] Tags</span>
          </button>
        </div>

        <textarea
          id="basics-lyrics"
          v-model="project.rawLyrics"
          rows="15"
          placeholder="Enter song lyrics (blank line between screen stanzas)..."
          class="w-full rounded-xl border border-slate-400 bg-white p-4 text-lg font-mono leading-relaxed text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple min-h-[360px]"
        ></textarea>
      </div>
    </div>
  </div>
</template>
