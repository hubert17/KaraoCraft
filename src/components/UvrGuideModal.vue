<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore';
import { X, Sparkles, CheckCircle2, Cpu } from '@lucide/vue';

const project = useProjectStore();
</script>

<template>
  <div
    v-if="project.showUvrGuideModal"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-6"
    @click.self="project.showUvrGuideModal = false"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-7 text-slate-900 max-h-[90vh] overflow-y-auto">
      <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div class="inline-flex items-center gap-2 text-brand-purple font-semibold text-sm uppercase tracking-wider mb-1">
            <Sparkles class="w-4 h-4" />
            <span>Recommended Stem Separation Workflow</span>
          </div>
          <h2 class="text-2xl font-bold text-slate-900">
            How to Extract Vocal Stems with UVR5
          </h2>
        </div>
        <button
          type="button"
          @click="project.showUvrGuideModal = false"
          class="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <div class="mt-5 space-y-5 text-base leading-relaxed text-slate-700">
        <p>
          KaraoCraft uses an isolated <strong>Vocal Stem</strong> so that waveforms, phrase boundaries, and syllable timings are crystal-clear without drums or instruments getting in the way.
        </p>

        <div class="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3.5">
          <h3 class="text-lg font-bold text-slate-900">
            Step-by-Step Using Ultimate Vocal Remover (UVR v5.6)
          </h3>

          <div class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-full bg-brand-purple text-white font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">1</span>
            <div>
              <strong class="text-slate-900">Install Ultimate Vocal Remover (Free & Open-Source):</strong>
              Download the macOS Apple Silicon (<code>arm64</code>) installer from
              <span class="font-mono text-sm bg-white px-2 py-0.5 rounded border border-slate-200">ultimatevocalremover.com</span>.
            </div>
          </div>

          <div class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-full bg-brand-purple text-white font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">2</span>
            <div>
              <strong class="text-slate-900">Choose a Studio-Quality Separation Model:</strong>
              Set Process Method to <strong>MDX-Net</strong> (select <code>Kim_Vocal_2</code> or <code>UVR-MDX-NET Inst HQ 3</code>) or <strong>Demucs v4</strong> (<code>htdemucs_ft</code>). Enable <strong>GPU Conversion</strong> for fast Apple Silicon speeds.
            </div>
          </div>

          <div class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-full bg-brand-purple text-white font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">3</span>
            <div>
              <strong class="text-slate-900">Save Both Stems (Vocals + Instrumental):</strong>
              Uncheck "Vocals Only" so UVR saves two files:
              <code class="text-sm bg-white px-1.5 py-0.5 rounded border border-slate-200">Song (Vocals).wav</code> and
              <code class="text-sm bg-white px-1.5 py-0.5 rounded border border-slate-200">Song (Instrumental).wav</code>.
            </div>
          </div>

          <div class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-full bg-brand-purple text-white font-bold text-sm flex items-center justify-center shrink-0 mt-0.5">4</span>
            <div>
              <strong class="text-slate-900">Import into KaraoCraft:</strong>
              Select your <strong>Vocals</strong> file in Step 1 to align and fine-tune timings on the clean vocal waveform. Later on the <strong>Video</strong> tab, attach your <strong>Instrumental</strong> file to render the final karaoke MP4!
            </div>
          </div>
        </div>

        <div class="bg-purple-50/70 border border-purple-200 rounded-xl p-4 flex items-start gap-3 text-sm text-slate-700">
          <Cpu class="w-5 h-5 text-brand-purple shrink-0 mt-0.5" />
          <div>
            <strong class="text-slate-900">Optional AI Word Sync Tip (Apple Silicon):</strong>
            KaraoCraft includes a built-in vocal waveform aligner out of the box, and also auto-detects local Whisper if installed via
            <code class="bg-white px-1.5 py-0.5 rounded border border-purple-200 font-mono">pip3 install mlx-whisper</code>.
          </div>
        </div>
      </div>

      <div class="mt-6 pt-4 border-t border-slate-200 flex justify-end">
        <button
          type="button"
          @click="project.showUvrGuideModal = false"
          class="inline-flex items-center gap-2 bg-brand-purple hover:bg-brand-purpleHover text-white font-semibold text-base px-6 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <CheckCircle2 class="w-5 h-5" />
          <span>Got It</span>
        </button>
      </div>
    </div>
  </div>
</template>
