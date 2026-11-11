<script setup lang="ts">
import { useProjectStore } from '../stores/projectStore';
import { Palette, Type, Clock, LayoutTemplate } from '@lucide/vue';

const project = useProjectStore();

const fontPresets = [
  { label: 'SF Pro Display (Apple Standard)', value: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' },
  { label: 'Hiragino Sans (Recommended for Japanese CJK)', value: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif' },
  { label: 'Impact / Bold Arcade', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Futura Bold', value: 'Futura, "Trebuchet MS", sans-serif' },
  { label: 'Helvetica Neue Bold', value: '"Helvetica Neue", Arial, sans-serif' },
];

const colorPresets = [
  { label: 'Neon Cyan', color: '#00E5FF' },
  { label: 'Hot Pink', color: '#FF2A85' },
  { label: 'Arcade Yellow', color: '#FFD600' },
  { label: 'Studio Violet', color: '#8B5CF6' },
  { label: 'Emerald Green', color: '#10B981' },
];
</script>

<template>
  <div class="bg-obsidian-850 border border-slate-800 rounded-xl p-4 space-y-5 text-xs text-slate-300 overflow-y-auto">
    <div class="flex items-center gap-2 border-b border-slate-800 pb-3">
      <Palette class="w-4 h-4 text-karaoke-cyan" />
      <h3 class="font-bold text-sm text-slate-100">Styling & Stage Options</h3>
    </div>

    <!-- 1. Screen Lines & Layout -->
    <div class="space-y-2.5">
      <label class="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
        <LayoutTemplate class="w-3.5 h-3.5 text-slate-400" />
        <span>Layout & Screen Lines</span>
      </label>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <span class="text-[11px] text-slate-400 block mb-1">Simultaneous Lines</span>
          <select 
            v-model="project.styleConfig.screenLines"
            class="w-full bg-obsidian-900 border border-slate-700 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-karaoke-cyan"
          >
            <option :value="1">1 Line (Single)</option>
            <option :value="2">2 Lines (Standard)</option>
            <option :value="3">3 Lines</option>
            <option :value="4">4 Lines</option>
          </select>
        </div>

        <div>
          <span class="text-[11px] text-slate-400 block mb-1">Vertical Placement</span>
          <select 
            v-model="project.styleConfig.verticalPosition"
            class="w-full bg-obsidian-900 border border-slate-700 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-karaoke-cyan"
          >
            <option value="bottom">Bottom Third (Subtitles)</option>
            <option value="center">Center Stage</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 2. Typography & Fonts -->
    <div class="space-y-2.5">
      <label class="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
        <Type class="w-3.5 h-3.5 text-slate-400" />
        <span>Font & Typography</span>
      </label>

      <div>
        <span class="text-[11px] text-slate-400 block mb-1">Font Family</span>
        <select 
          v-model="project.styleConfig.fontFamily"
          class="w-full bg-obsidian-900 border border-slate-700 rounded-lg p-2 text-slate-100 focus:outline-none focus:border-karaoke-cyan"
        >
          <option v-for="f in fontPresets" :key="f.label" :value="f.value">
            {{ f.label }}
          </option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-2 pt-1">
        <div>
          <div class="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>Font Size</span>
            <span class="font-mono text-slate-300">{{ project.styleConfig.fontSize }}px</span>
          </div>
          <input 
            v-model.number="project.styleConfig.fontSize" 
            type="range" min="28" max="72" step="2"
            class="w-full accent-karaoke-cyan cursor-pointer"
          />
        </div>

        <div>
          <div class="flex justify-between text-[11px] text-slate-400 mb-1">
            <span>Outline Stroke</span>
            <span class="font-mono text-slate-300">{{ project.styleConfig.outlineWidth }}px</span>
          </div>
          <input 
            v-model.number="project.styleConfig.outlineWidth" 
            type="range" min="1" max="8" step="0.5"
            class="w-full accent-karaoke-cyan cursor-pointer"
          />
        </div>
      </div>

      <div class="flex items-center gap-2 pt-1">
        <input 
          id="allCapsCheckbox"
          v-model="project.styleConfig.allCaps" 
          type="checkbox"
          class="rounded bg-obsidian-900 border-slate-700 text-karaoke-cyan focus:ring-0"
        />
        <label for="allCapsCheckbox" class="text-xs text-slate-300 cursor-pointer">
          Convert all lyrics to UPPERCASE (Arcade look)
        </label>
      </div>
    </div>

    <!-- 3. Color & Wipe Palette -->
    <div class="space-y-2.5">
      <span class="font-semibold text-slate-200 uppercase tracking-wider text-[10px] block">
        Active Sung Color
      </span>
      <div class="flex items-center gap-2">
        <button
          v-for="c in colorPresets"
          :key="c.label"
          @click="project.styleConfig.activeColor = c.color"
          class="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
          :class="project.styleConfig.activeColor === c.color ? 'border-white scale-105 shadow-md' : 'border-transparent'"
          :style="{ backgroundColor: c.color }"
          :title="c.label"
        ></button>
        <input 
          v-model="project.styleConfig.activeColor" 
          type="color" 
          class="w-7 h-7 bg-transparent rounded cursor-pointer border border-slate-700"
          title="Custom Hex Color"
        />
      </div>
    </div>

    <!-- 4. Intro Card & Outro Configuration -->
    <div class="space-y-3 pt-2 border-t border-slate-800">
      <label class="font-semibold text-slate-200 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
        <Clock class="w-3.5 h-3.5 text-slate-400" />
        <span>Title Card & Outro Duration</span>
      </label>

      <!-- Intro Card Toggle & Duration -->
      <div class="bg-obsidian-900 p-2.5 rounded-lg border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer">
            <input 
              v-model="project.styleConfig.introCard.enabled" 
              type="checkbox" 
              class="rounded bg-obsidian-950 border-slate-700 text-karaoke-cyan"
            />
            <span>Opening Title Card</span>
          </label>
          <div class="flex items-center gap-1">
            <input 
              v-model.number="project.styleConfig.introCard.durationSeconds"
              type="number" min="1" max="15" step="0.5"
              class="w-14 bg-obsidian-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-100"
            />
            <span class="text-[10px] text-slate-400">sec</span>
          </div>
        </div>
      </div>

      <!-- Outro Screen Toggle & Duration -->
      <div class="bg-obsidian-900 p-2.5 rounded-lg border border-slate-800 space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-xs font-medium text-slate-200 flex items-center gap-1.5 cursor-pointer">
            <input 
              v-model="project.styleConfig.outroCard.enabled" 
              type="checkbox" 
              class="rounded bg-obsidian-950 border-slate-700 text-karaoke-cyan"
            />
            <span>Closing Outro Screen</span>
          </label>
          <div class="flex items-center gap-1">
            <input 
              v-model.number="project.styleConfig.outroCard.durationSeconds"
              type="number" min="1" max="15" step="0.5"
              class="w-14 bg-obsidian-950 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-100"
            />
            <span class="text-[10px] text-slate-400">sec</span>
          </div>
        </div>
        <input 
          v-model="project.styleConfig.outroCard.message"
          type="text"
          placeholder="Outro message (e.g. Thank You for Singing!)"
          class="w-full bg-obsidian-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200"
        />
      </div>
    </div>
  </div>
</template>

