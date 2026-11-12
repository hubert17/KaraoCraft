<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore';
import KaraokeRenderer from './KaraokeRenderer.vue';
import { Minus, Plus } from '@lucide/vue';

const project = useProjectStore();

function adjustTextSize(delta: number) {
  const next = Math.max(16, Math.min(64, project.options.textSize + delta));
  project.options.textSize = next;
}

function applyPreset(preset: 'croonify' | 'gold' | 'magenta') {
  if (preset === 'croonify') {
    project.options.bgColor = '#000000';
    project.options.activeColor = '#3dbeff';
    project.options.unsungColor = '#ffffff';
    project.options.outlineColor = '#004bfa';
  } else if (preset === 'gold') {
    project.options.bgColor = '#090d16';
    project.options.activeColor = '#facc15';
    project.options.unsungColor = '#ffffff';
    project.options.outlineColor = '#1e293b';
  } else {
    project.options.bgColor = '#0f0720';
    project.options.activeColor = '#f472b6';
    project.options.unsungColor = '#ffffff';
    project.options.outlineColor = '#6d28d9';
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-white px-8 py-6">
    <div class="max-w-5xl mx-auto space-y-6">
      <!-- Top Interactive Preview Stage + 4-Corner Bounding Box Controls -->
      <div class="flex flex-col items-center">
        <KaraokeRenderer :editable-box="true" :max-height-px="270" />

        <!-- H-Center & V-Center Checkboxes (Slides 3, 4, 5) -->
        <div class="mt-3.5 flex flex-wrap items-center justify-center gap-6 text-base font-semibold text-slate-800">
          <label class="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              :checked="project.options.hCenter"
              @change="project.toggleHCenter(($event.target as HTMLInputElement).checked)"
              class="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
            <span>H-Center</span>
          </label>

          <label class="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              :checked="project.options.vCenter"
              @change="project.toggleVCenter(($event.target as HTMLInputElement).checked)"
              class="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
            <span>V-Center</span>
          </label>

          <span class="text-sm font-normal text-slate-500">
            Drag the 4 white circles on the preview screen to adjust lyrics width & line spacing
          </span>
        </div>
      </div>

      <!-- Streamlined Single-View Options Cards (Combining Video, Text & Frames!) -->
      <div class="border border-slate-200 rounded-2xl bg-slate-50/60 p-5">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
          <!-- Card 1: Screen & Frame Layout -->
          <div class="bg-white rounded-2xl shadow-card border border-slate-200/90 p-5 space-y-5">
            <h3 class="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Screen & Frames
            </h3>

            <!-- Aspect Ratio -->
            <div class="flex items-center justify-between gap-3">
              <span class="text-base font-medium text-slate-800">Aspect</span>
              <div class="inline-flex rounded-xl bg-slate-200/80 p-1">
                <button
                  type="button"
                  @click="project.options.aspectRatio = '4:3'"
                  class="px-4 py-1.5 rounded-lg text-base font-semibold transition-all"
                  :class="
                    project.options.aspectRatio === '4:3'
                      ? 'bg-brand-purple text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  "
                >
                  4:3
                </button>
                <button
                  type="button"
                  @click="project.options.aspectRatio = '16:9'"
                  class="px-4 py-1.5 rounded-lg text-base font-semibold transition-all"
                  :class="
                    project.options.aspectRatio === '16:9'
                      ? 'bg-brand-purple text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  "
                >
                  16:9
                </button>
              </div>
            </div>

            <!-- Lines per Frame -->
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-base font-medium text-slate-800">Lines / Frame</div>
                <div class="text-xs text-slate-500">{{ project.totalFramesCount }} frames total</div>
              </div>
              <div class="inline-flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden">
                <button
                  type="button"
                  :disabled="project.options.linesPerFrame <= 1"
                  @click="project.setLinesPerFrame(project.options.linesPerFrame - 1)"
                  class="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-900 transition-colors"
                >
                  <Minus class="w-4 h-4" />
                </button>
                <span class="w-12 text-center text-lg font-bold text-slate-900 select-none">
                  {{ project.options.linesPerFrame }}
                </span>
                <button
                  type="button"
                  :disabled="project.options.linesPerFrame >= 8"
                  @click="project.setLinesPerFrame(project.options.linesPerFrame + 1)"
                  class="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-900 transition-colors"
                >
                  <Plus class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Background Color -->
            <div class="flex items-center justify-between gap-3">
              <label for="opt-bg-color" class="text-base font-medium text-slate-800">
                Background
              </label>
              <input
                id="opt-bg-color"
                v-model="project.options.bgColor"
                type="color"
                class="clean-swatch w-28 h-10"
              />
            </div>
          </div>

          <!-- Card 2: Text Size & Typography -->
          <div class="bg-white rounded-2xl shadow-card border border-slate-200/90 p-5 space-y-5">
            <h3 class="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              Typography
            </h3>

            <!-- Text Size -->
            <div class="flex items-center justify-between gap-3">
              <span class="text-base font-medium text-slate-800">Text Size</span>
              <div class="inline-flex items-center rounded-xl border border-slate-300 bg-white overflow-hidden">
                <button
                  type="button"
                  @click="adjustTextSize(-2)"
                  class="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-900 transition-colors"
                >
                  <Minus class="w-4 h-4" />
                </button>
                <span class="w-14 text-center text-lg font-bold text-slate-900 select-none">
                  {{ project.options.textSize }}
                </span>
                <button
                  type="button"
                  @click="adjustTextSize(2)"
                  class="w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-900 transition-colors"
                >
                  <Plus class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- Bold -->
            <div class="flex items-center justify-between gap-3">
              <span class="text-base font-medium text-slate-800">Bold</span>
              <div class="inline-flex rounded-xl bg-slate-200/80 p-1">
                <button
                  type="button"
                  @click="project.options.bold = false"
                  class="px-4 py-1.5 rounded-lg text-base font-semibold transition-all"
                  :class="
                    !project.options.bold
                      ? 'bg-brand-purple text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  "
                >
                  Reg
                </button>
                <button
                  type="button"
                  @click="project.options.bold = true"
                  class="px-4 py-1.5 rounded-lg text-base font-semibold transition-all"
                  :class="
                    project.options.bold
                      ? 'bg-brand-purple text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  "
                >
                  Bold
                </button>
              </div>
            </div>

            <!-- Outline Toggle -->
            <div class="flex items-center justify-between gap-3">
              <span class="text-base font-medium text-slate-800">Outline</span>
              <div class="inline-flex rounded-xl bg-slate-200/80 p-1">
                <button
                  type="button"
                  @click="project.options.outline = false"
                  class="px-4 py-1.5 rounded-lg text-base font-semibold transition-all"
                  :class="
                    !project.options.outline
                      ? 'bg-brand-purple text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  "
                >
                  Off
                </button>
                <button
                  type="button"
                  @click="project.options.outline = true"
                  class="px-4 py-1.5 rounded-lg text-base font-semibold transition-all"
                  :class="
                    project.options.outline
                      ? 'bg-brand-purple text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  "
                >
                  On
                </button>
              </div>
            </div>
          </div>

          <!-- Card 3: Karaoke Colors & Presets -->
          <div class="bg-white rounded-2xl shadow-card border border-slate-200/90 p-5 space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 class="text-lg font-bold text-slate-900">Colors</h3>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  @click="applyPreset('croonify')"
                  class="w-5 h-5 rounded-full bg-[#004bfa] border border-slate-300"
                  title="Classic Croonify Blue"
                ></button>
                <button
                  type="button"
                  @click="applyPreset('gold')"
                  class="w-5 h-5 rounded-full bg-[#facc15] border border-slate-300"
                  title="Classic Gold Karaoke"
                ></button>
                <button
                  type="button"
                  @click="applyPreset('magenta')"
                  class="w-5 h-5 rounded-full bg-[#f472b6] border border-slate-300"
                  title="Pop Magenta"
                ></button>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <label for="opt-active-color" class="text-base font-medium text-slate-800">
                Sung Sweep
              </label>
              <input
                id="opt-active-color"
                v-model="project.options.activeColor"
                type="color"
                class="clean-swatch w-28 h-9"
              />
            </div>

            <div class="flex items-center justify-between gap-3">
              <label for="opt-base-color" class="text-base font-medium text-slate-800">
                Base Text
              </label>
              <input
                id="opt-base-color"
                v-model="project.options.unsungColor"
                type="color"
                class="clean-swatch w-28 h-9"
              />
            </div>

            <div class="flex items-center justify-between gap-3">
              <label for="opt-outline-color" class="text-base font-medium text-slate-800">
                Outline Color
              </label>
              <input
                id="opt-outline-color"
                v-model="project.options.outlineColor"
                type="color"
                class="clean-swatch w-28 h-9"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
