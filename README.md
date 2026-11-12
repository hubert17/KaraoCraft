# KaraoCraft 🎤✨

> A desktop-native, studio-grade karaoke video creator and timing editor for **macOS Apple Silicon** built with **Tauri v2**, **Rust**, and **Vue 3**.

KaraoCraft brings modern, local-first karaoke creation to your desktop. Inspired by professional karaoke timing tools and the Croonify workflow, KaraoCraft enables creators to take isolated vocal stems, automatically align lyrics down to the syllable with local AI, polish timings with micro-adjusters, customize visual layout with a live 4-corner bounding box, and export broadcast-ready 1080p 60fps karaoke videos and `.ass` subtitles.

---

## 🌟 Key Features

### 1. Local AI Alignment & Audio Engine
* **Local Whisper AI Alignment:** Automatically transcribes and extracts exact word-level start/end timestamps from vocal stems using OpenAI Whisper or MLX-Whisper.
* **Needleman-Wunsch Sequence Alignment:** Matches user-supplied formatted lyrics against Whisper speech tokens using dynamic programming, preserving custom capitalization, punctuation, and stanza breaks.
* **Built-in Vocal Waveform Aligner (Fallback):** Decodes RMS audio energy into non-silent vocal "islands" so musical intros, solos, and instrumental interludes are automatically respected even without AI.
* **Dual-Stem Audio Engine:** Independent playback, gain, and mute controls for isolated vocal stems and instrumental backing tracks via Web Audio API.

### 2. Studio Workflow Tabs
* **Basics Tab:**
  * Drag-and-drop dual-stem intake (vocal track + backing track).
  * Song Title and Artist metadata configuration.
  * Multilingual lyrics editor with auto-sanitization (strips `[Verse]`/`[Chorus]` tags, smart quote normalizer, stanza preservation).
* **Options Tab:**
  * **Interactive 4-Corner Bounding Box:** Drag white corner handles directly on the 16:9 stage preview to resize lyrics margins, line widths, and vertical slot heights.
  * **Layout Controls:** Horizontal & Vertical centering toggles, lines-per-frame pagination (2, 3, 4, etc.).
  * **Typography & Palette:** Font size, weight, font family (includes full CJK presets for Japanese Kanji/Kana), sung/unsung wipe colors, outline thickness, and background color.
* **Line Timings Tab:**
  * Line-by-line start and end adjustments with real-time waveform scrubbers.
  * Frame boundary markers showing screen group pagination.
  * **Resync Words Modal:** Easily re-align syllable timings within customized line bounds proportionally or to vocal energy peaks.
* **Word Timings Tab:**
  * Syllable and word-level precision timing editor.
  * Inline micro-adjusters (`-0.05s` / `+0.05s`) for rapid fine-tuning.
  * Interactive playhead previewing exact character sweep wipes.
* **Video Export Tab:**
  * One-click rendering of full HD **1080p 60fps MP4** karaoke videos baked with FFmpeg hardware encoding and `libass`.
  * Advanced **ASS Karaoke Subtitles** (`.ass`) with calculated screen display intervals and progressive `\kf` karaoke fill tags.
  * Standard subtitle and lyric exports: **Enhanced LRC** (`.lrc`), **WebVTT** (`.vtt`), and **SRT** (`.srt`).
  * Self-contained `.karaocraft` JSON project save and load.

---

## 📋 System Requirements & Prerequisites

| Requirement | Purpose | Recommended Installation |
| :--- | :--- | :--- |
| **macOS** | Desktop Host OS | Apple Silicon (M1/M2/M3/M4) or Intel macOS 12+ |
| **Node.js** | Frontend tooling | `v20.x` or `v22.x` (`brew install node`) |
| **Rust & Cargo** | Tauri native backend | `v1.80+` (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`) |
| **FFmpeg with libass** | MP4 video baking & subtitle burn-in | `brew install ffmpeg` (verify with `ffmpeg -version`) |
| **Whisper CLI** | Syllable & word AI alignment | `pipx install --python python3.10 openai-whisper` (see below) |

### Installing Whisper for Syllable Alignment

To enable local AI word-level alignment, install OpenAI Whisper so it is accessible in your `$PATH` or `~/.local/bin/whisper`:

```bash
# Recommended: Install via pipx using Python 3.10 / 3.11 / 3.12
pipx install --python /opt/homebrew/bin/python3.10 openai-whisper

# Or using pip directly:
pip3 install openai-whisper
```

> [!TIP]
> KaraoCraft auto-detects `whisper` and `mlx_whisper` on startup. On Apple Silicon Macs, KaraoCraft runs Whisper in FP32 CPU/Metal mode using the fast `base` model.

---

## 🚀 Development & Build

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
```bash
# Run full desktop app (Tauri + Vue 3 Vite)
npm run tauri dev

# Or run frontend only in browser (mock mode)
npm run dev
```

### 3. Run Test Suite
```bash
npm run test
```

### 4. Build Production Desktop App
```bash
# Produces universal/arm64 .app and .dmg in src-tauri/target/release/bundle/
npm run tauri build
```

---

## 🏗️ Architecture Overview

```
KaraoCraft/
├── src/
│   ├── components/
│   │   ├── BasicsPage.vue        # Audio stems, metadata & lyrics input
│   │   ├── EditorSidebar.vue     # Left navigation bar
│   │   ├── HeaderBar.vue         # Top bar with capability status & actions
│   │   ├── KaraokeRenderer.vue   # Live 16:9 canvas with 4-corner bounding box
│   │   ├── OptionsPage.vue       # Visual styling, colors, layout & font controls
│   │   ├── ResyncModal.vue       # Word timing redistribution dialog
│   │   ├── SetupScreen.vue       # Intake & project initiation view
│   │   ├── TimingsEditor.vue     # Line & word timing polishing editor
│   │   ├── UvrGuideModal.vue     # Stem separation guide modal
│   │   └── VideoExportPage.vue   # MP4 rendering & subtitle exporter view
│   ├── services/
│   │   ├── alignmentEngine.ts    # Whisper DP aligner & RMS envelope detector
│   │   ├── audioEngine.ts        # Dual-stem Web Audio playback & scrubbing
│   │   └── subtitleExporter.ts   # ASS (\kf tags), LRC, VTT, and SRT generator
│   └── stores/
│       └── projectStore.ts       # Central Pinia store with undo/redo & state
├── src-tauri/
│   └── src/
│       └── lib.rs                # Tauri backend: system capabilities, whisper bridge, FFmpeg
└── tests/
    └── karaokeEngine.test.ts     # Automated tests for alignment, ASS export & parsing
```

---

## 📄 License
MIT
