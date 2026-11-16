<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener';
import { useProjectStore, showAboutModalRef, showFirstRunSetupRef } from '../stores/projectStore';
import { X, ExternalLink, Heart, Cpu, Film, Sparkles, Code2, Download } from '@lucide/vue';

const project = useProjectStore();
const showAboutModal = showAboutModalRef;
const REPO_URL = 'https://github.com/hubert17/KaraoCraft';

async function openExternal(url: string) {
  if (project.isTauriEnv) {
    try {
      await openUrl(url);
      return;
    } catch {
      // Fall back to window.open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div
    v-if="showAboutModal"
    class="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-6"
    @click.self="showAboutModal = false"
  >
    <div class="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-7 text-slate-900 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
        <div class="flex items-baseline gap-2">
          <span class="text-4xl font-serif font-bold text-slate-900">𝄞</span>
          <div>
            <div class="flex items-center gap-2.5">
              <h2 class="text-3xl font-script italic font-bold text-slate-900 leading-none">
                KaraoCraft
              </h2>
              <span class="text-xs font-bold uppercase tracking-wider bg-purple-100 text-brand-purple px-2.5 py-0.5 rounded-full">
                v0.2.1
              </span>
            </div>
            <p class="text-sm text-slate-500 mt-1">
              Studio-Grade macOS Karaoke Video Creator &amp; AI Phonetic Lyrics Aligner
            </p>
          </div>
        </div>

        <button
          type="button"
          @click="showAboutModal = false"
          class="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Creator & GitHub Repo -->
      <div class="mt-5 bg-purple-50/70 border border-purple-200/80 rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <div class="text-xs font-bold uppercase tracking-wider text-brand-purple flex items-center gap-1">
            <Heart class="w-3.5 h-3.5 fill-current" />
            <span>Created &amp; Maintained By</span>
          </div>
          <div class="text-base font-bold text-slate-900 mt-0.5">
            Bernard Gabon (<span class="font-mono text-sm text-slate-700">@hubert17</span>)
          </div>
        </div>

        <button
          type="button"
          @click="openExternal(REPO_URL)"
          class="shrink-0 inline-flex items-center gap-1.5 bg-brand-purple hover:bg-brand-purpleHover text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <span>GitHub Repository</span>
          <ExternalLink class="w-4 h-4" />
        </button>
      </div>

      <!-- Credits: AI Models, Audio/Video Tools & Libraries -->
      <div class="mt-5 space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500">
          Powered By &amp; Open-Source Credits
        </h3>

        <div class="grid grid-cols-1 gap-2.5 text-sm">
          <div class="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 flex items-start gap-3">
            <Cpu class="w-4 h-4 text-brand-purple shrink-0 mt-0.5" />
            <div>
              <strong class="text-slate-900">AI Phonetic Forced Alignment:</strong>
              <div class="text-slate-600 text-xs mt-0.5 leading-relaxed">
                Meta <strong>MMS_FA</strong> (<code>torchaudio</code> CTC Viterbi forced aligner), <strong>uroman</strong> (Universal Romanizer), <strong>pykakasi</strong> (Japanese Kanji/Kana transliteration), and <strong>OpenAI Whisper / MLX-Whisper</strong>.
              </div>
            </div>
          </div>

          <div class="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 flex items-start gap-3">
            <Film class="w-4 h-4 text-brand-purple shrink-0 mt-0.5" />
            <div>
              <strong class="text-slate-900">Video Rendering &amp; Subtitles:</strong>
              <div class="text-slate-600 text-xs mt-0.5 leading-relaxed">
                <strong>FFmpeg</strong>, <strong>libass</strong> (Advanced SubStation Alpha <code>\kf</code> karaoke sweep renderer), and <strong>Apple VideoToolbox</strong> hardware H.264 encoding.
              </div>
            </div>
          </div>

          <div class="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 flex items-start gap-3">
            <Sparkles class="w-4 h-4 text-brand-purple shrink-0 mt-0.5" />
            <div>
              <strong class="text-slate-900">Audio Engine &amp; Stem Separation Companion:</strong>
              <div class="text-slate-600 text-xs mt-0.5 leading-relaxed">
                <strong>Web Audio API</strong> sample-accurate dual-stem engine, designed to pair with <strong>Ultimate Vocal Remover (UVR5)</strong> &amp; Demucs / MDX-Net stems, inspired by the <strong>Croonify</strong> studio workflow.
              </div>
            </div>
          </div>

          <div class="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 flex items-start gap-3">
            <Code2 class="w-4 h-4 text-brand-purple shrink-0 mt-0.5" />
            <div>
              <strong class="text-slate-900">Application Framework &amp; UI:</strong>
              <div class="text-slate-600 text-xs mt-0.5 leading-relaxed">
                Built with <strong>Tauri v2</strong>, <strong>Rust</strong>, <strong>Vue 3</strong>, <strong>Pinia</strong>, <strong>TypeScript</strong>, <strong>Tailwind CSS</strong>, and <strong>Lucide Icons</strong>.
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="openExternal(REPO_URL)"
            class="font-mono hover:text-brand-purple hover:underline cursor-pointer"
          >
            github.com/hubert17/KaraoCraft
          </button>
          <button
            type="button"
            @click="
              showAboutModal = false;
              showFirstRunSetupRef = true;
            "
            class="inline-flex items-center gap-1 text-brand-purple font-semibold hover:underline cursor-pointer"
          >
            <Download class="w-3.5 h-3.5" />
            <span>Setup / Verify Engines</span>
          </button>
        </div>
        <button
          type="button"
          @click="showAboutModal = false"
          class="bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-sm px-5 py-2 rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
