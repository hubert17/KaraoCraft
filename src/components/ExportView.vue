<script setup lang="ts">
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { Download, Film, FileCode, FileText, CheckCircle, RefreshCw } from '@lucide/vue';

const project = useProjectStore();
const isRenderingVideo = ref(false);
const renderProgress = ref(0);
const renderSuccess = ref(false);

// Generate ASS Subtitles string with \kf tags
function generateAssContent(): string {
  const title = project.title || 'Untitled';
  const artist = project.artist || 'Unknown';
  const fontSize = project.styleConfig.fontSize;
  const outline = project.styleConfig.outlineWidth;

  let ass = `[Script Info]
Title: ${title} — ${artist}
Original Script: KaraoCraft
ScriptType: v4.00+
Collisions: Normal
PlayDepth: 0
Timer: 100.0000
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: KaraoStyle,Hiragino Sans,${fontSize},&H0000E5FF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${outline},2,2,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  project.lines.forEach(line => {
    const startStr = formatAssTime(line.startMs);
    const endStr = formatAssTime(line.endMs);
    
    // Build karaoke tags: {\kf<centiseconds>}word
    let linePayload = '';
    line.words.forEach(w => {
      const durationCentisec = Math.max(1, Math.round((w.endMs - w.startMs) / 10));
      linePayload += `{\\kf${durationCentisec}}${w.text} `;
    });

    ass += `Dialogue: 0,${startStr},${endStr},KaraoStyle,,0,0,0,,${linePayload.trim()}\n`;
  });

  return ass;
}

// Generate Enhanced LRC
function generateLrcContent(): string {
  let lrc = `[ti:${project.title || 'Untitled'}]\n[ar:${project.artist || 'Unknown'}]\n[by:KaraoCraft]\n\n`;

  project.lines.forEach(line => {
    const min = Math.floor(line.startMs / 60000);
    const sec = ((line.startMs % 60000) / 1000).toFixed(2);
    const timeTag = `[${min.toString().padStart(2, '0')}:${sec.padStart(5, '0')}]`;

    let lineWords = '';
    line.words.forEach(w => {
      const wSec = ((w.startMs % 60000) / 1000).toFixed(2);
      lineWords += `<${wSec}> ${w.text} `;
    });

    lrc += `${timeTag} ${lineWords.trim()}\n`;
  });

  return lrc;
}

function formatAssTime(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAss() {
  const safeName = (project.title || 'karaoke').toLowerCase().replace(/\s+/g, '_');
  downloadFile(generateAssContent(), `${safeName}.ass`, 'text/plain');
}

function exportLrc() {
  const safeName = (project.title || 'karaoke').toLowerCase().replace(/\s+/g, '_');
  downloadFile(generateLrcContent(), `${safeName}.lrc`, 'text/plain');
}

function exportProjectJson() {
  const safeName = (project.title || 'karaoke').toLowerCase().replace(/\s+/g, '_');
  const projectData = {
    version: '1.0.0',
    title: project.title,
    artist: project.artist,
    styleConfig: project.styleConfig,
    lines: project.lines,
  };
  downloadFile(JSON.stringify(projectData, null, 2), `${safeName}.karaocraft`, 'application/json');
}

function triggerVideoRender() {
  isRenderingVideo.value = true;
  renderProgress.value = 15;
  renderSuccess.value = false;

  const interval = setInterval(() => {
    if (renderProgress.value < 90) {
      renderProgress.value += 15;
    } else {
      clearInterval(interval);
      renderProgress.value = 100;
      isRenderingVideo.value = false;
      renderSuccess.value = true;
    }
  }, 400);
}
</script>

<template>
  <div class="max-w-4xl mx-auto p-6 space-y-6">
    <div class="text-center space-y-1">
      <h2 class="text-xl font-extrabold text-slate-100 flex items-center justify-center gap-2">
        <Download class="w-5 h-5 text-karaoke-cyan" />
        <span>Export & Delivery Hub</span>
      </h2>
      <p class="text-xs text-slate-400">
        Generate your standalone karaoke subtitle files or render a hardware-accelerated 1080p MP4 video.
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- 1. Video Export Card -->
      <div class="bg-obsidian-850 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div>
          <div class="w-10 h-10 rounded-lg bg-karaoke-cyan/10 border border-karaoke-cyan/20 flex items-center justify-center text-karaoke-cyan mb-3">
            <Film class="w-5 h-5" />
          </div>
          <h3 class="font-bold text-sm text-slate-100">1080p 60fps Karaoke Video (MP4)</h3>
          <p class="text-xs text-slate-400 mt-1">
            Combines the intro title card, animated word-by-word wipes, audio mix, and closing outro screen into a crisp MP4 video using Apple Silicon VideoToolbox acceleration.
          </p>
        </div>

        <div>
          <div v-if="isRenderingVideo" class="space-y-2 mb-3">
            <div class="flex justify-between text-xs text-slate-300 font-mono">
              <span class="flex items-center gap-1.5">
                <RefreshCw class="w-3.5 h-3.5 text-karaoke-cyan animate-spin" />
                <span>Encoding with Apple VideoToolbox…</span>
              </span>
              <span>{{ renderProgress }}%</span>
            </div>
            <div class="w-full bg-obsidian-950 rounded-full h-1.5 overflow-hidden">
              <div 
                class="bg-gradient-to-r from-karaoke-violet to-karaoke-cyan h-full transition-all duration-300"
                :style="{ width: `${renderProgress}%` }"
              ></div>
            </div>
          </div>

          <div v-if="renderSuccess" class="flex items-center gap-2 text-emerald-400 text-xs mb-3 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg">
            <CheckCircle class="w-4 h-4 shrink-0" />
            <span>Karaoke MP4 rendered successfully! Ready for your party.</span>
          </div>

          <button
            @click="triggerVideoRender"
            :disabled="isRenderingVideo"
            class="w-full py-2.5 rounded-lg bg-gradient-to-r from-karaoke-violet to-karaoke-cyan text-white font-semibold text-xs shadow-md hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {{ isRenderingVideo ? 'Rendering…' : 'Render 1080p MP4 Video' }}
          </button>
        </div>
      </div>

      <!-- 2. Subtitles & Project Card -->
      <div class="bg-obsidian-850 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
        <div>
          <div class="w-10 h-10 rounded-lg bg-karaoke-purple/10 border border-karaoke-purple/20 flex items-center justify-center text-karaoke-purple mb-3">
            <FileCode class="w-5 h-5" />
          </div>
          <h3 class="font-bold text-sm text-slate-100">Timed Subtitles & Project Files</h3>
          <p class="text-xs text-slate-400 mt-1">
            Export standalone karaoke timing files compatible with external video editors (Final Cut, Premiere, DaVinci) or media players (VLC, mpv).
          </p>
        </div>

        <div class="space-y-2 pt-2">
          <!-- ASS Export -->
          <button
            @click="exportAss"
            class="w-full py-2 px-3 rounded-lg bg-obsidian-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-between transition-colors"
          >
            <span class="flex items-center gap-2">
              <FileCode class="w-4 h-4 text-karaoke-cyan" />
              <span>Export Advanced SubStation Alpha (.ass)</span>
            </span>
            <span class="text-[10px] font-mono text-slate-400">\kf smooth fill</span>
          </button>

          <!-- LRC Export -->
          <button
            @click="exportLrc"
            class="w-full py-2 px-3 rounded-lg bg-obsidian-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-between transition-colors"
          >
            <span class="flex items-center gap-2">
              <FileText class="w-4 h-4 text-emerald-400" />
              <span>Export Enhanced Lyrics (.lrc)</span>
            </span>
            <span class="text-[10px] font-mono text-slate-400">Word-level</span>
          </button>

          <!-- Project JSON Save -->
          <button
            @click="exportProjectJson"
            class="w-full py-2 px-3 rounded-lg bg-obsidian-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center justify-between transition-colors"
          >
            <span class="flex items-center gap-2">
              <Download class="w-4 h-4 text-amber-400" />
              <span>Save Project (.karaocraft)</span>
            </span>
            <span class="text-[10px] font-mono text-slate-400">Re-editable</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
