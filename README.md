# KaraoCraft 🎤✨
> A desktop-native, studio-grade karaoke lyrics creator and timing editor for **macOS Apple Silicon** built with **Tauri v2**, **Rust**, and **Vue 3**.

---

## Highlights

* **100% Local-First & Zero Uploads:** Runs entirely on-device with zero server wait times or size limits.
* **Dual-Stem Audio Architecture:** Works directly with clean vocal stems (pre-extracted via UVR/Moises) and optional backing tracks.
* **Slick Studio Intake Workspace:** Drag-and-drop audio dropzone with automatic tag extraction, waveform decoding, and a multilingual lyrics editor with instant sanitization (strip `[Verse]` / `[Chorus]` tags, collapse blanks, fix smart quotes).
* **Live 60 FPS Karaoke Stage:** Responsive 16:9 canvas with Croonify-style progressive syllable wipes, customizable fonts (full CJK Japanese Kanji/Kana support), high-contrast outlines, opening title card, and outro.
* **DAW-Style Timing Polishing Ribbon:** Interactive waveform timeline with draggable and resizable word blocks, plus a **Spacebar Tap-to-Sync** live mode.
* **Triple Export Pipeline:**
  * **1080p 60fps MP4:** Baked with Apple Silicon `VideoToolbox` hardware encoding.
  * **ASS Karaoke Subtitles:** With smooth `\kf` karaoke fill tags.
  * **Enhanced LRC:** Word-level timestamped lyrics.
  * **Project Files:** Versioned `.karaocraft` JSON projects.

---

## Getting Started

### Prerequisites
* **macOS (Apple Silicon)**
* **Node.js** (v20+) & **npm**
* **Rust & Cargo** (v1.80+)
* **FFmpeg** (optional for local MP4 rendering, e.g. `brew install ffmpeg`)

### Development

```bash
# Install dependencies
npm install

# Run frontend in browser dev mode
npm run dev

# Run full desktop app in Tauri dev mode
npm run tauri dev
```

### Build

```bash
# Compile and package native macOS desktop application (.app / .dmg)
npm run tauri build
```
