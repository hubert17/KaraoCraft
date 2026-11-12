import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  alignLyricsWithWaveform,
  alignLyricsWithWhisperWords,
  resyncWordsWithinLines,
  parseRawLyrics,
} from '../src/services/alignmentEngine.ts';
import {
  generateAssSubtitle,
  generateEnhancedLrc,
  hexToAssColor,
} from '../src/services/subtitleExporter.ts';

const LF = String.fromCharCode(10);

describe('KaraoCraft Alignment & Subtitle Engine', () => {
  it('parses stanzas and preserves blank-line frame breaks', () => {
    const raw = [
      'Koi mo nidome nara',
      'Sukoshi wa jouzu ni',
      '',
      'Anata no se-eta',
      'Sodeguchi tsumande',
    ].join(LF);

    const parsed = parseRawLyrics(raw);
    assert.equal(parsed.length, 4);
    assert.equal(parsed[0].stanzaBreakBefore, false);
    assert.equal(parsed[1].stanzaBreakBefore, false);
    assert.equal(parsed[2].stanzaBreakBefore, true);
    assert.equal(parsed[3].stanzaBreakBefore, false);
  });

  it('skips silent intro/interlude islands when aligning vocal RMS envelope', () => {
    // 20-second track at 50 Hz = 1000 frames
    // Silence 0..4s, Singing Island 1: 4..9s, Silence 9..13s, Singing Island 2: 13..18s, Silence 18..20s
    const rmsHz = 50;
    const durationSec = 20;
    const env = new Float32Array(durationSec * rmsHz);
    for (let f = 200; f < 450; f++) env[f] = 0.75; // 4.0s .. 9.0s
    for (let f = 650; f < 900; f++) env[f] = 0.80; // 13.0s .. 18.0s

    const raw = [
      'First phrase in verse one',
      'Second phrase in verse one',
      '',
      'Third phrase after break',
      'Fourth phrase at the end',
    ].join(LF);

    const aligned = alignLyricsWithWaveform(raw, durationSec, env, rmsHz, 4);
    assert.equal(aligned.length, 4);

    // First line should start near the 4s vocal onset (not at 0s silence!)
    assert.ok(aligned[0].startSec >= 3.8 && aligned[0].startSec <= 4.5, `Expected ~4.0s, got ${aligned[0].startSec}`);
    // Stanza break assigns Frame 0 to first two lines and Frame 1 to last two lines
    assert.equal(aligned[0].frameIndex, 0);
    assert.equal(aligned[1].frameIndex, 0);
    assert.equal(aligned[2].frameIndex, 1);
    assert.equal(aligned[3].frameIndex, 1);

    // Ensure strict monotonic word progression
    for (const line of aligned) {
      assert.ok(line.endSec > line.startSec);
      for (let i = 0; i < line.words.length; i++) {
        const w = line.words[i];
        assert.ok(w.endSec > w.startSec);
        if (i > 0) {
          assert.ok(w.startSec >= line.words[i - 1].endSec - 0.001);
        }
      }
    }
  });

  it('resyncs words strictly inside customized line start/end bounds', () => {
    const rmsHz = 50;
    const env = new Float32Array(500).fill(0.5);
    const initial = alignLyricsWithWaveform('Hello world karaoke studio', 10, env, rmsHz, 4);
    initial[0].startSec = 2.5;
    initial[0].endSec = 6.5;

    const resynced = resyncWordsWithinLines(initial, env, rmsHz);
    assert.equal(resynced[0].startSec, 2.5);
    assert.equal(resynced[0].endSec, 6.5);
    assert.equal(resynced[0].words[0].startSec, 2.5);
    assert.equal(resynced[0].words[resynced[0].words.length - 1].endSec, 6.5);
  });

  it('aligns pasted lyrics against Whisper word timestamps via DP', () => {
    const raw = ['Koi mo nidome', 'Sukoshi wa jouzu'].join(LF);
    const whisperWords = [
      { word: 'Koi', start: 1.2, end: 1.6 },
      { word: 'mo', start: 1.65, end: 1.9 },
      { word: 'nidome', start: 1.95, end: 2.7 },
      { word: 'Sukoshi', start: 3.5, end: 4.1 },
      { word: 'wa', start: 4.12, end: 4.35 },
      { word: 'jouzu', start: 4.4, end: 5.2 },
    ];

    const aligned = alignLyricsWithWhisperWords(raw, whisperWords, 8, null, 50, 4);
    assert.equal(aligned.length, 2);
    assert.equal(aligned[0].startSec, 1.2);
    assert.equal(aligned[0].endSec, 2.7);
    assert.equal(aligned[1].startSec, 3.5);
    assert.equal(aligned[1].endSec, 5.2);
  });

  it('generates valid ASS karaoke script and renders cleanly through FFmpeg libass', () => {
    assert.equal(hexToAssColor('#004bfa', '00'), '&H00FA4B00');

    const aligned = alignLyricsWithWaveform(
      ['Koi mo nidome nara', 'Sukoshi wa jouzu ni'].join(LF),
      4,
      null,
      50,
      4
    );

    const ass = generateAssSubtitle({
      title: 'Second Love',
      artist: 'Takao Kisugi',
      lines: aligned,
      options: {
        aspectRatio: '4:3',
        bgColor: '#000000',
        textSize: 32,
        activeColor: '#3dbeff',
        unsungColor: '#ffffff',
        outlineColor: '#004bfa',
        bold: true,
        outline: true,
        hCenter: true,
        vCenter: true,
        linesPerFrame: 4,
        boxLeft: 0.07,
        boxTop: 0.21,
        boxWidth: 0.86,
        boxHeight: 0.58,
      },
      durationSec: 4,
      quality: '720p',
    });

    const bs = String.fromCharCode(92);
    assert.ok(ass.includes(`${bs}kf`), 'ASS output must contain \kf karaoke sweep tags');
    assert.ok(ass.includes(`${bs}pos(`), 'ASS output must contain \pos positioning tags');

    const lrc = generateEnhancedLrc({
      title: 'Second Love',
      artist: 'Takao Kisugi',
      lines: aligned,
    });
    assert.ok(lrc.includes('[ti:Second Love]'));
    assert.ok(lrc.includes('<00:'));

    // End-to-end FFmpeg + libass verification if local ffmpeg is installed
    const ffmpegBin = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : null;
    if (ffmpegBin) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karaocraft-test-'));
      try {
        const assFile = path.join(tmpDir, 'karaoke.ass');
        const mp4File = path.join(tmpDir, 'out.mp4');
        fs.writeFileSync(assFile, ass, 'utf8');

        execFileSync(
          ffmpegBin,
          [
            '-y',
            '-f',
            'lavfi',
            '-i',
            'color=c=0x000000:s=960x720:r=24:d=1.5',
            '-f',
            'lavfi',
            '-i',
            'anullsrc=r=44100:cl=stereo:d=1.5',
            '-vf',
            'ass=karaoke.ass',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-shortest',
            mp4File,
          ],
          { cwd: tmpDir, stdio: 'pipe' }
        );

        const stat = fs.statSync(mp4File);
        assert.ok(stat.size > 1000, 'Rendered MP4 file should be non-empty');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  });
});
