<script setup lang="ts">
import { computed } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import { FileText, Eraser, AlignJustify, Quote, Languages, BookOpen } from '@lucide/vue';

const project = useProjectStore();

const lineNumbers = computed(() => {
  const count = project.rawLyrics.split('\n').length || 1;
  return Array.from({ length: count }, (_, i) => i + 1);
});

function loadSampleLyrics() {
  project.rawLyrics = `[Verse 1]
Like a cruel angel with no mercy
You will soon become a legend!

[Chorus]
Zankoku na tenshi no teeze
Madobe kara yagate tobitatsu
Hotobashiru atsui patosu de
Omoide wo uragiru nara
Kono sora wo daite kagayaku
Shounen yo shinwa ni nare!`;

  if (!project.title) project.title = "A Cruel Angel's Thesis";
  if (!project.artist) project.artist = "Yoko Takahashi";
}
</script>

<template>
  <div class="flex flex-col h-full bg-obsidian-850 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
    <!-- Header & Sanitization Bar -->
    <div class="px-3.5 py-2.5 bg-obsidian-800/80 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <FileText class="w-4 h-4 text-karaoke-cyan" />
        <span class="text-xs font-semibold text-slate-200">Lyrics Studio</span>
        
        <!-- Detected Language/Script Badge -->
        <span 
          v-if="project.lyricStats.hasCJK"
          class="text-[10px] bg-pink-500/10 border border-pink-500/30 text-pink-300 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono"
        >
          <Languages class="w-3 h-3" />
          <span>CJK / Japanese Kanji & Kana</span>
        </span>
        <span 
          v-else-if="project.lyricStats.lines > 0"
          class="text-[10px] bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono"
        >
          <Languages class="w-3 h-3" />
          <span>Latin (English / Tagalog)</span>
        </span>
      </div>

      <!-- Quick Cleaning Toolbar -->
      <div class="flex items-center gap-1.5">
        <button
          @click="project.stripSectionLabels"
          :disabled="!project.rawLyrics"
          class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-obsidian-700 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Strip [Verse], [Chorus], chords, and section tags"
        >
          <Eraser class="w-3 h-3 text-amber-400" />
          <span>Strip Tags</span>
        </button>

        <button
          @click="project.collapseBlankLines"
          :disabled="!project.rawLyrics"
          class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-obsidian-700 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Remove extra blank lines"
        >
          <AlignJustify class="w-3 h-3 text-blue-400" />
          <span>Trim Blanks</span>
        </button>

        <button
          @click="project.normalizeSmartQuotes"
          :disabled="!project.rawLyrics"
          class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-obsidian-700 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Convert curly smart quotes & dashes to standard ASCII"
        >
          <Quote class="w-3 h-3 text-emerald-400" />
          <span>Fix Quotes</span>
        </button>

        <button
          v-if="!project.rawLyrics"
          @click="loadSampleLyrics"
          class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-karaoke-purple/20 hover:bg-karaoke-purple/30 text-purple-200 border border-karaoke-purple/40 transition-colors ml-1"
          title="Load sample bilingual lyrics"
        >
          <BookOpen class="w-3 h-3 text-purple-300" />
          <span>Sample</span>
        </button>
      </div>
    </div>

    <!-- Lyrics Textarea with Line Numbers -->
    <div class="relative flex-1 flex overflow-hidden">
      <!-- Line Number Strip -->
      <div 
        class="w-10 bg-obsidian-900/90 text-slate-600 border-r border-slate-800 text-right pr-2 pt-3 font-mono text-xs select-none overflow-hidden shrink-0"
      >
        <div v-for="n in lineNumbers" :key="n" class="leading-6">
          {{ n }}
        </div>
      </div>

      <!-- Main Editor -->
      <textarea
        v-model="project.rawLyrics"
        placeholder="Paste full song lyrics here...

Tip: Ensure repeated lines are written out every time they are sung. 
You can use the 'Strip Tags' button above to automatically remove [Verse] or [Chorus] labels."
        class="flex-1 bg-obsidian-900 px-3.5 pt-3 pb-8 text-slate-100 placeholder-slate-600 font-sans text-sm leading-6 resize-none focus:outline-none overflow-y-auto selection:bg-karaoke-cyan/30"
        spellcheck="false"
      ></textarea>
    </div>

    <!-- Bottom Metrics Bar -->
    <div class="px-3.5 py-1.5 bg-obsidian-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono">
      <div class="flex items-center gap-4">
        <span>Lines: <strong class="text-slate-200">{{ project.lyricStats.lines }}</strong></span>
        <span>Words: <strong class="text-slate-200">{{ project.lyricStats.words }}</strong></span>
        <span>Chars: <strong class="text-slate-200">{{ project.lyricStats.chars }}</strong></span>
      </div>
      <div class="text-[10px] text-slate-500">
        Lines correlate 1:1 with timeline tracks
      </div>
    </div>
  </div>
</template>

