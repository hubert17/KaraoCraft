<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { CheckCircle2, HelpCircle, Loader2, Sparkles, Eraser } from '@lucide/vue';

const project = useProjectStore();
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);

function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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

function loadSampleLyrics() {
  if (!project.title) project.title = 'Second Love';
  if (!project.artist) project.artist = 'Takao Kisugi';
  project.rawLyrics = [
    'Koi mo nidome nara',
    'Sukoshi wa jouzu ni',
    'Ai no messe-ji tsutaetai',
    '',
    'Anata no se-eta',
    'Sodeguchi tsumande',
    'Utsumuku dake nante',
    '',
    'Kaeritaku nai',
    'Soba ni itai no',
    'Sono hitoko to ga ienai',
  ].join(String.fromCharCode(10));
}
</script>

<template>
  <div class="flex-1 overflow-y-auto bg-white px-8 py-8">
    <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
      <!-- Left Column: Step 1 (Select Vocal Stem) & Step 2 (Title & Artist) -->
      <div class="lg:col-span-5 space-y-8">
        <!-- 1. Select Vocal Stem File -->
        <section>
          <div class="text-center mb-3">
            <h2 class="text-2xl font-bold text-slate-900">1. Select Vocal Stem File</h2>
            <p class="text-base font-medium text-slate-700 mt-0.5">*Isolated Vocals Recommended</p>
          </div>

          <div class="bg-white rounded-3xl shadow-card border border-slate-200/90 p-5">
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
              class="rounded-2xl border-2 border-dashed transition-all p-7 text-center flex flex-col items-center justify-center min-h-[210px]"
              :class="
                isDragging
                  ? 'border-brand-purple bg-purple-50/70'
                  : project.vocalFile
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-slate-300 bg-slate-50/40 hover:border-slate-400'
              "
            >
              <!-- Decoding Spinner -->
              <div v-if="project.isDecodingAudio" class="space-y-3 py-2">
                <Loader2 class="w-10 h-10 text-brand-purple animate-spin mx-auto" />
                <p class="text-lg font-semibold text-slate-800">Decoding vocal waveform...</p>
              </div>

              <!-- Loaded File State -->
              <div v-else-if="project.vocalFile" class="space-y-3 w-full">
                <CheckCircle2 class="w-10 h-10 text-emerald-600 mx-auto" />
                <div class="font-bold text-lg text-slate-900 break-words px-2">
                  {{ project.vocalFileName }}
                </div>
                <div class="text-base text-slate-600 font-medium">
                  Duration: {{ formatDuration(project.duration) }}
                </div>
                <div class="pt-1">
                  <button
                    type="button"
                    @click="fileInputRef?.click()"
                    class="bg-brand-purple hover:bg-brand-purpleHover text-white font-semibold text-base px-6 py-2.5 rounded-xl shadow-sm transition-colors"
                  >
                    Change File
                  </button>
                </div>
              </div>

              <!-- Empty Dropzone State (Slide 1 style) -->
              <div v-else class="space-y-4">
                <button
                  type="button"
                  @click="fileInputRef?.click()"
                  class="bg-brand-purple hover:bg-brand-purpleHover text-white font-semibold text-lg px-9 py-3 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  Browse
                </button>
                <div class="text-base text-slate-500 leading-snug">
                  <div>Drop Vocal Stem Audio</div>
                  <div class="text-sm text-slate-400 mt-0.5">(.wav, .mp3, .m4a, .flac, ...)</div>
                </div>
              </div>
            </div>

            <!-- Error Banner -->
            <p v-if="project.audioError" class="mt-3 text-sm font-medium text-red-600 text-center">
              {{ project.audioError }}
            </p>

            <!-- UVR Vocal Stem Helper Callout -->
            <div class="mt-4 bg-purple-50/80 border border-purple-200/80 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div class="text-sm text-slate-700 leading-snug">
                <strong class="text-slate-900">Have a full song?</strong> Extract clean Vocal & Instrumental stems free with <strong>UVR5</strong>.
              </div>
              <button
                type="button"
                @click="project.showUvrGuideModal = true"
                class="shrink-0 inline-flex items-center gap-1 text-sm font-bold text-brand-purple hover:underline"
              >
                <HelpCircle class="w-4 h-4" />
                <span>How-To</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 2. Add Title & Artist -->
        <section>
          <div class="text-center mb-3">
            <h2 class="text-2xl font-bold text-slate-900">2. Add Title & Artist</h2>
          </div>

          <div class="bg-white rounded-3xl shadow-card border border-slate-200/90 p-6 space-y-5">
            <div>
              <label for="setup-title" class="block text-center text-lg font-semibold text-slate-800 mb-2">
                Title
              </label>
              <input
                id="setup-title"
                v-model="project.title"
                type="text"
                placeholder="Song Title"
                class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>

            <div>
              <label for="setup-artist" class="block text-center text-lg font-semibold text-slate-800 mb-2">
                Artist
              </label>
              <input
                id="setup-artist"
                v-model="project.artist"
                type="text"
                placeholder="Artist Name"
                class="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
          </div>
        </section>
      </div>

      <!-- Right Column: Step 3 (Paste Lyrics + Submit) -->
      <div class="lg:col-span-7 flex flex-col">
        <div class="text-center mb-3">
          <h2 class="text-3xl font-bold text-slate-900">3. Paste Lyrics</h2>
          <p class="text-lg font-medium text-slate-800 mt-0.5">
            *Do NOT forget lyrics that repeat
          </p>
        </div>

        <div class="bg-white rounded-3xl shadow-card border border-slate-200/90 p-6 flex flex-col">
          <div class="flex items-center justify-between gap-2 mb-3">
            <span class="text-sm font-medium text-slate-500">
              Blank lines separate karaoke screen frames
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                @click="project.stripSectionHeaders()"
                class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-3 py-1.5 rounded-lg transition-colors"
                title="Remove [Verse], [Chorus] tags"
              >
                <Eraser class="w-4 h-4" />
                <span>Remove [Tags]</span>
              </button>
              <button
                v-if="!project.rawLyrics.trim()"
                type="button"
                @click="loadSampleLyrics"
                class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-purple hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Sparkles class="w-4 h-4" />
                <span>Paste Sample</span>
              </button>
            </div>
          </div>

          <textarea
            v-model="project.rawLyrics"
            rows="16"
            placeholder="Paste full song lyrics here (one phrase per line, blank line between verses)..."
            class="w-full rounded-xl border border-slate-300 bg-white p-4 text-lg leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple resize-y min-h-[420px]"
          ></textarea>
        </div>

        <div class="mt-6">
          <button
            type="button"
            :disabled="!project.canSubmit || project.isAligning"
            @click="project.submitSetup()"
            class="w-full rounded-2xl py-4 px-8 text-xl font-bold text-white shadow-md transition-all flex items-center justify-center gap-3"
            :class="
              project.canSubmit && !project.isAligning
                ? 'bg-brand-purple hover:bg-brand-purpleHover cursor-pointer active:scale-[0.99]'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
            "
          >
            <Loader2 v-if="project.isAligning" class="w-6 h-6 animate-spin" />
            <span>{{ project.isAligning ? project.alignmentMessage || 'Syncing Lyrics...' : 'Submit' }}</span>
          </button>
          <p
            v-if="!project.vocalFile || !project.rawLyrics.trim()"
            class="text-center text-sm text-slate-500 mt-2.5"
          >
            Select a vocal stem audio file and paste lyrics above to continue.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
