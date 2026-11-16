# KaraoCraft 🎤✨

> A desktop-native, studio-grade karaoke video creator and timing editor for **macOS Apple Silicon** built with **Tauri v2**, **Rust**, and **Vue 3**.

KaraoCraft brings modern, local-first karaoke creation to your desktop. Inspired by professional karaoke timing tools and the Croonify workflow, KaraoCraft enables creators to take isolated vocal stems, automatically align lyrics down to the syllable with local AI, polish timings with micro-adjusters, customize visual layout with a live 4-corner bounding box, and export broadcast-ready 1080p 60fps karaoke videos and `.ass` subtitles.

---

## 🌟 Key Features

### 1. Local AI Phonetic Forced Alignment & Audio Engine
* **Phonetic Forced Alignment (`MMS_FA` + `uroman` + `pykakasi`):** Uses Meta's Massively Multilingual Speech CTC forced aligner (`torchaudio.pipelines.MMS_FA`) on Apple Silicon GPU (`mps`) / CPU with universal phonetic transliteration (`uroman` & Japanese `pykakasi`) and vocal-sustain tail extension for ~95% word-level accuracy—even on Romaji lyrics for Japanese songs.
* **Whisper + Needleman-Wunsch & Vocal Waveform Fallbacks:** Automatically falls back to OpenAI Whisper / MLX-Whisper DP sequence alignment or built-in RMS vocal-island detection if `torchaudio` is not installed.
* **Sample-Accurate Web Audio Dual-Stem Engine:** Plays decoded vocal and instrumental `AudioBuffer`s with zero drift, independent mix modes (`Instrumental Only`, `Guide Mix`, `Vocal Stem Only`), and `0.5x–1.5x` speed control—even when reloading projects from `.json`.

### 2. Project Workflow & Studio Tabs
* **Native Project Save & Open (`.json`):**
  * **New / Open / Save / Save As (`⌘S` / `⇧⌘S`):** Start fresh, open existing `.json` projects (with validation for non-KaraoCraft JSON files), or save in-place without creating duplicate copies.
  * **Smart Path Linking:** Stores references to your vocal and instrumental audio files without copying or moving them, and remembers your audio and project folders separately.
* **Setup & Basics Tab:**
  * Drag-and-drop or native audio stem picker, Title/Artist metadata, and quick lyric formatting tools (**Sentence case**, **Uppercase**, and **Remove `[Tags]`**).
* **Options Tab:**
  * **Interactive 4-Corner Bounding Box:** Drag white corner handles directly on the stage preview to resize lyrics margins, line widths, and vertical slot heights.
  * **Layout Controls:** Horizontal & Vertical centering toggles, lines-per-frame pagination (2, 3, 4, etc.).
  * **Typography & Palette:** Font size, weight, sung/unsung wipe colors, outline thickness, and background color.
* **Line Timings & Word Timings Tabs:**
  * Line-by-line and word-by-word adjustments with real-time waveform scrubbers, Tap Sync (`T`), inline `-0.05s` / `+0.05s` micro-adjusters, and **Resync Modal**.
* **Broadcast Karaoke Transitions & Video Export Tab:**
  * **3-Second Lyric Lead-In & Lookahead:** Incoming lyric frames (or Slot 0 lookahead on tight transitions) appear 3 seconds before their first sung word so singers always have time to read ahead.
  * **Automatic `------------ Break ------------` Banners:** Auto-inserted across long instrumental gaps (`>= 8.0s`) with a progressive sweep countdown.
  * **Moderate-Gap Hold & Smooth Fades:** Retains lyric frames for ~2 seconds on moderate pauses and applies `250ms` fade-in / `300ms` fade-out transitions in both live preview and `.ass` / MP4 output.
  * **Intro & Outro Title/Artist Cards:** Automatically scheduled before the first lyric frame and after the final lyric frame.
  * **One-Click MP4 & Subtitle Export:** Hardware-accelerated H.264 (`h264_videotoolbox`) MP4 rendering via FFmpeg + `libass`, plus `.ass`, Enhanced `.lrc`, and `.json` project export.

---

## 📦 Download & Install (macOS Apple Silicon)

1. Download the latest **`KaraoCraft_x.y.z_aarch64.dmg`** from [GitHub Releases](https://github.com/hubert17/KaraoCraft/releases) and drag **KaraoCraft.app** into your `/Applications` folder.
2. **Clear macOS Quarantine (Required Once for Unsigned Builds):**
   Because the release build is not notarized with an Apple Developer ID certificate, macOS Gatekeeper will show *"KaraoCraft is damaged and can't be opened"* when downloaded via Chrome or Safari. Run this once in Terminal before launching:
   ```bash
   xattr -cr /Applications/KaraoCraft.app
   ```
3. **One-Click First-Run Setup:**
   On first launch, KaraoCraft automatically checks for **FFmpeg** and the **AI Phonetic Aligner (`MMS_FA`)** and offers to download and configure them with one click—no manual Python or Homebrew setup required.

---

## 📋 System Requirements & Prerequisites (For Development)

| Requirement | Purpose | Recommended Installation |
| :--- | :--- | :--- |
| **macOS** | Desktop Host OS | Apple Silicon (M1/M2/M3/M4) or Intel macOS 12+ |
| **Node.js** | Frontend tooling | `v20.x` or `v22.x` (`brew install node`) |
| **Rust & Cargo** | Tauri native backend | `v1.80+` (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh`) |
| **FFmpeg with libass** | MP4 video baking & subtitle burn-in | `brew install ffmpeg` (verify with `ffmpeg -version`) |
| **Whisper / MMS_FA** | Phonetic forced alignment (`torchaudio`, `uroman`, `pykakasi`) & Whisper fallback | `pipx install --python python3.10 openai-whisper` + `pip install torchaudio uroman pykakasi` |

### Installing Phonetic Forced Alignment (`MMS_FA`) & Whisper

To enable Apple Silicon GPU-accelerated phonetic forced alignment (`MMS_FA`) and Whisper fallback, install them into your `openai-whisper` pipx environment:

```bash
# 1. Install OpenAI Whisper via pipx
pipx install --python /opt/homebrew/bin/python3.10 openai-whisper

# 2. Add torchaudio + universal phonetic transliteration (uroman & pykakasi)
~/.local/pipx/venvs/openai-whisper/bin/python -m pip install torchaudio uroman pykakasi
```

> [!TIP]
> KaraoCraft auto-detects `torchaudio` + `uroman` (for `MMS_FA` forced alignment on Apple Silicon `mps`/CPU) and falls back to `mlx_whisper` / `whisper` if unavailable.

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
