<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { Mic, Music, UploadCloud, CheckCircle2, X, RefreshCw } from '@lucide/vue';

const project = useProjectStore();
const isVocalDragging = ref(false);
const isInstDragging = ref(false);
const vocalLoading = ref(false);
const instLoading = ref(false);

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

async function processAudioFile(file: File, isVocal: boolean) {
  const loadingRef = isVocal ? vocalLoading : instLoading;
  loadingRef.value = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

    const stemInfo = {
      name: file.name,
      path: (file as any).path || file.name,
      sizeBytes: file.size,
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      audioBuffer,
    };

    if (isVocal) {
      project.setVocalStem(stemInfo);

      // Auto-guess Title & Artist from filename if not already set (e.g., "Adele - Hello (Vocals).wav")
      if (!project.title && !project.artist) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();
        if (cleanName.includes(' - ')) {
          const parts = cleanName.split(' - ');
          project.setMetadata(parts[1].trim(), parts[0].trim());
        } else {
          project.setMetadata(cleanName, '');
        }
      }
    } else {
      project.setInstrumentalStem(stemInfo);
    }
  } catch (err) {
    console.error('Audio decode error:', err);
  } finally {
    loadingRef.value = false;
  }
}

function handleVocalDrop(e: DragEvent) {
  isVocalDragging.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type.includes('audio') || /\.(wav|mp3|flac|m4a|aac|ogg)$/i.test(file.name)) {
      processAudioFile(file, true);
    }
  }
}

function handleInstDrop(e: DragEvent) {
  isInstDragging.value = false;
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.type.includes('audio') || /\.(wav|mp3|flac|m4a|aac|ogg)$/i.test(file.name)) {
      processAudioFile(file, false);
    }
  }
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
</script>

<template>
  <div class="space-y-4">
    <!-- 1. Vocal Stem Dropzone (Required) -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Mic class="w-3.5 h-3.5 text-karaoke-cyan" />
          <span>Vocal Stem</span>
          <span class="text-[10px] text-karaoke-cyan bg-karaoke-cyan/10 border border-karaoke-cyan/30 px-1.5 py-0.5 rounded font-mono">REQUIRED</span>
        </label>
        <span v-if="project.vocalStem" class="text-xs text-slate-400 font-mono">
          {{ formatDuration(project.vocalStem.durationSeconds) }} • {{ project.vocalStem.sampleRate }}Hz
        </span>
      </div>

      <div
        v-if="!project.vocalStem"
        @dragover.prevent="isVocalDragging = true"
        @dragleave.prevent="isVocalDragging = false"
        @drop="handleVocalDrop"
        :class="[
          'relative border-2 border-dashed rounded-xl p-6 transition-all duration-200 text-center cursor-pointer group',
          isVocalDragging 
            ? 'border-karaoke-cyan bg-karaoke-cyan/5 shadow-[0_0_20px_rgba(0,229,255,0.15)]' 
            : 'border-slate-700/70 hover:border-slate-500 bg-obsidian-850/60 hover:bg-obsidian-850'
        ]"
      >
        <input 
          type="file" 
          accept="audio/*,.wav,.mp3,.flac,.m4a" 
          class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          @change="(e: any) => e.target.files?.[0] && processAudioFile(e.target.files[0], true)"
        />
        
        <div v-if="vocalLoading" class="flex flex-col items-center justify-center py-2 space-y-2">
          <RefreshCw class="w-7 h-7 text-karaoke-cyan animate-spin" />
          <p class="text-xs text-slate-300">Decoding audio stem & analyzing waveform…</p>
        </div>

        <div v-else class="flex flex-col items-center space-y-2">
          <div class="w-10 h-10 rounded-full bg-karaoke-cyan/10 border border-karaoke-cyan/20 flex items-center justify-center text-karaoke-cyan group-hover:scale-105 transition-transform">
            <UploadCloud class="w-5 h-5" />
          </div>
          <div>
            <p class="text-xs font-medium text-slate-200">
              Drop isolated <span class="text-karaoke-cyan font-semibold">Vocal Stem</span> here, or click to browse
            </p>
            <p class="text-[11px] text-slate-400 mt-0.5">Supports WAV, FLAC, MP3, M4A from UVR / Moises</p>
          </div>
        </div>
      </div>

      <!-- Loaded Vocal Stem Card -->
      <div 
        v-else 
        class="bg-obsidian-800 border border-karaoke-cyan/30 rounded-xl p-3 flex items-center justify-between shadow-sm"
      >
        <div class="flex items-center space-y-0.5 gap-3 overflow-hidden">
          <div class="w-8 h-8 rounded-lg bg-karaoke-cyan/10 border border-karaoke-cyan/20 flex items-center justify-center text-karaoke-cyan shrink-0">
            <CheckCircle2 class="w-4 h-4" />
          </div>
          <div class="overflow-hidden">
            <p class="text-xs font-medium text-slate-100 truncate">{{ project.vocalStem.name }}</p>
            <p class="text-[10px] text-slate-400 font-mono">
              {{ formatBytes(project.vocalStem.sizeBytes) }} • {{ project.vocalStem.channels === 1 ? 'Mono' : 'Stereo' }}
            </p>
          </div>
        </div>

        <button 
          @click="project.setVocalStem(null as any)"
          class="text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
          title="Remove stem"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 2. Instrumental Stem Dropzone (Optional) -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <label class="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Music class="w-3.5 h-3.5 text-karaoke-purple" />
          <span>Instrumental Stem</span>
          <span class="text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-mono">OPTIONAL</span>
        </label>
        <span v-if="project.instrumentalStem" class="text-xs text-slate-400 font-mono">
          {{ formatDuration(project.instrumentalStem.durationSeconds) }}
        </span>
      </div>

      <div
        v-if="!project.instrumentalStem"
        @dragover.prevent="isInstDragging = true"
        @dragleave.prevent="isInstDragging = false"
        @drop="handleInstDrop"
        :class="[
          'relative border border-dashed rounded-xl p-3.5 transition-all duration-200 text-center cursor-pointer group',
          isInstDragging 
            ? 'border-karaoke-purple bg-karaoke-purple/5' 
            : 'border-slate-800 hover:border-slate-600 bg-obsidian-850/40 hover:bg-obsidian-850'
        ]"
      >
        <input 
          type="file" 
          accept="audio/*,.wav,.mp3,.flac,.m4a" 
          class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          @change="(e: any) => e.target.files?.[0] && processAudioFile(e.target.files[0], false)"
        />

        <div v-if="instLoading" class="flex items-center justify-center py-1 space-x-2">
          <RefreshCw class="w-4 h-4 text-karaoke-purple animate-spin" />
          <span class="text-xs text-slate-400">Loading instrumental…</span>
        </div>

        <div v-else class="flex items-center justify-center space-x-2">
          <Music class="w-4 h-4 text-slate-400 group-hover:text-karaoke-purple transition-colors" />
          <span class="text-xs text-slate-400 group-hover:text-slate-300">
            Drop backing music stem (for playback preview & final mix)
          </span>
        </div>
      </div>

      <!-- Loaded Instrumental Stem Card -->
      <div 
        v-else 
        class="bg-obsidian-800 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between text-xs"
      >
        <div class="flex items-center gap-2.5 overflow-hidden">
          <Music class="w-4 h-4 text-karaoke-purple shrink-0" />
          <span class="text-slate-200 truncate">{{ project.instrumentalStem.name }}</span>
        </div>
        <button 
          @click="project.setInstrumentalStem(null)"
          class="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

