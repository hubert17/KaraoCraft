use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemCapabilities {
    pub ffmpeg_available: bool,
    pub ffmpeg_path: Option<String>,
    pub libass_available: bool,
    pub whisper_available: bool,
    pub whisper_engine: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WhisperWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperAlignmentResponse {
    pub available: bool,
    pub engine: Option<String>,
    pub exact_aligned: bool,
    pub words: Vec<WhisperWord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderMp4Request {
    pub ass_content: String,
    pub audio_base64: String,
    pub audio_ext: String,
    pub bg_color: String,
    pub width: u32,
    pub height: u32,
    pub duration_sec: f64,
    pub output_filename: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderMp4Response {
    pub output_path: String,
    pub encoder_used: String,
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let mut table = [255u8; 256];
    for (i, &b) in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        .iter()
        .enumerate()
    {
        table[b as usize] = i as u8;
    }

    let cleaned: Vec<u8> = input
        .bytes()
        .filter(|&b| !b.is_ascii_whitespace() && b != b'=')
        .collect();

    let mut out = Vec::with_capacity(cleaned.len() * 3 / 4 + 4);
    let mut i = 0;
    while i < cleaned.len() {
        let rem = cleaned.len() - i;
        if rem < 2 {
            return Err("Invalid base64 input length".to_string());
        }
        let b0 = table[cleaned[i] as usize];
        let b1 = table[cleaned[i + 1] as usize];
        if b0 == 255 || b1 == 255 {
            return Err("Invalid base64 character".to_string());
        }
        out.push((b0 << 2) | (b1 >> 4));

        if rem > 2 {
            let b2 = table[cleaned[i + 2] as usize];
            if b2 == 255 {
                return Err("Invalid base64 character".to_string());
            }
            out.push((b1 << 4) | (b2 >> 2));

            if rem > 3 {
                let b3 = table[cleaned[i + 3] as usize];
                if b3 == 255 {
                    return Err("Invalid base64 character".to_string());
                }
                out.push((b2 << 6) | b3);
            }
        }
        i += 4;
    }

    Ok(out)
}

fn search_binary(names: &[&str]) -> Option<(String, PathBuf)> {
    let mut search_dirs: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
    ];

    if let Ok(home) = env::var("HOME") {
        search_dirs.insert(0, PathBuf::from(&home).join(".local/bin"));
        search_dirs.push(PathBuf::from(&home).join("Library/Python/3.11/bin"));
        search_dirs.push(PathBuf::from(&home).join("Library/Python/3.12/bin"));
        search_dirs.push(PathBuf::from(&home).join("Library/Python/3.13/bin"));
    }

    if let Ok(path_var) = env::var("PATH") {
        for dir in env::split_paths(&path_var) {
            if !search_dirs.contains(&dir) {
                search_dirs.push(dir);
            }
        }
    }

    for &name in names {
        for dir in &search_dirs {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some((name.to_string(), candidate));
            }
        }
    }
    None
}

fn check_ffmpeg_libass(ffmpeg_path: &Path) -> bool {
    if let Ok(out) = Command::new(ffmpeg_path).arg("-filters").output() {
        let stdout = String::from_utf8_lossy(&out.stdout);
        return stdout.contains(" ass ") || stdout.contains(" subtitles ");
    }
    false
}

fn sanitize_filename(name: &str) -> String {
    let backslash = char::from(92);
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c == backslash || matches!(c, '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                '-'
            } else if c.is_control() {
                ' '
            } else {
                c
            }
        })
        .collect::<String>()
        .trim()
        .to_string();

    if cleaned.is_empty() {
        "KaraoCraft_Video".to_string()
    } else {
        cleaned
    }
}

fn unique_stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn find_mms_python() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(home) = env::var("HOME") {
        let home_path = PathBuf::from(&home);
        candidates.push(home_path.join(".local/pipx/venvs/openai-whisper/bin/python"));
        candidates.push(home_path.join(".local/pipx/venvs/openai-whisper/bin/python3"));
    }
    if let Some((_, whisper_bin)) = search_binary(&["whisper"]) {
        if let Ok(head) = fs::read_to_string(&whisper_bin) {
            if let Some(first_line) = head.lines().next() {
                if let Some(rest) = first_line.strip_prefix("#!") {
                    if let Some(py_token) = rest.split_whitespace().next() {
                        candidates.push(PathBuf::from(py_token));
                    }
                }
            }
        }
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/python3"));
    candidates.push(PathBuf::from("/usr/local/bin/python3"));

    for py in candidates {
        if !py.is_file() {
            continue;
        }
        // Check if torchaudio and uroman are importable in this python environment
        if let Ok(status) = Command::new(&py)
            .args(["-c", "import torchaudio, uroman"])
            .status()
        {
            if status.success() {
                return Some(py);
            }
        }
    }
    None
}

const MMS_ALIGNER_SCRIPT: &str = r#"import json, re, subprocess, sys, numpy as np, torch
from torchaudio.pipelines import MMS_FA as bundle
import uroman as ur

try:
    import pykakasi
    kks = pykakasi.kakasi()
except Exception:
    kks = None

def main():
    audio_path = sys.argv[1]
    words_json_path = sys.argv[2]
    out_json_path = sys.argv[3]
    ffmpeg_bin = sys.argv[4]

    with open(words_json_path, "r", encoding="utf-8") as f:
        words_raw = json.load(f)

    if not words_raw:
        with open(out_json_path, "w", encoding="utf-8") as f:
            json.dump([], f)
        return

    cmd = [ffmpeg_bin, "-v", "error", "-i", audio_path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]
    raw_pcm = subprocess.check_output(cmd)
    samples = np.frombuffer(raw_pcm, dtype=np.float32).copy()
    duration = len(samples) / 16000.0

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = bundle.get_model(with_star=True).to(device)
    model.eval()

    stride = 60 * 16000
    pad = 80 * 320
    emissions = []
    with torch.inference_mode():
        pos = 0
        while pos < len(samples):
            end_pos = min(len(samples), pos + stride)
            left_pad = min(pos, pad)
            right_pad = min(len(samples) - end_pos, pad)
            seg = torch.from_numpy(samples[pos - left_pad : end_pos + right_pad]).unsqueeze(0).to(device)
            if seg.size(1) < 640:
                break
            em, _ = model(seg)
            em = em[0].cpu()
            trim_left = left_pad // 320
            trim_right = em.size(0) - (right_pad // 320) if right_pad > 0 else em.size(0)
            emissions.append(em[trim_left:trim_right])
            pos = end_pos

    emission = torch.cat(emissions, dim=0)
    num_frames = emission.size(0)
    ratio = duration / num_frames

    hop = max(1, int(round(len(samples) / num_frames)))
    frame_rms = np.zeros(num_frames, dtype=np.float32)
    for i in range(num_frames):
        seg = samples[i * hop : min(len(samples), (i + 1) * hop)]
        if len(seg) > 0:
            frame_rms[i] = np.sqrt(np.mean(seg * seg))
    smooth_rms = np.convolve(frame_rms, np.ones(5) / 5.0, mode="same")
    p20 = float(np.percentile(smooth_rms, 20))
    p85 = float(np.percentile(smooth_rms, 85))
    sustain_thresh = max(0.012, p20 + (p85 - p20) * 0.12)

    uroman_inst = ur.Uroman()
    dictionary = bundle.get_dict(star="*")
    aligner = bundle.get_aligner()

    transcript = []
    for w in words_raw:
        w_conv = w
        if kks is not None and any("\u3040" <= ch <= "\u9fff" for ch in w_conv):
            w_conv = "".join(item["hepburn"] for item in kks.convert(w_conv))
        w_norm = re.sub(r"([aeiou])-([aeiou])", r"\1\2", w_conv.lower())
        w_norm = re.sub(r"([aeiou])-", r"\1\1", w_norm)
        rom = uroman_inst.romanize_string(w_norm).lower()
        clean = "".join(c for c in rom if c in dictionary and c != "-" and c != "*")
        transcript.append(clean if clean else "*")

    tokens = [[dictionary[c] for c in w] for w in transcript]
    word_spans = aligner(emission, tokens)

    out_words = []
    for i, w in enumerate(words_raw):
        sp = word_spans[i]
        if not sp:
            prev_end = out_words[-1]["end"] if out_words else 0.0
            out_words.append({"word": w, "start": prev_end, "end": prev_end + 0.15})
            continue
        s_frame = sp[0].start
        e_frame = sp[-1].end
        next_s_frame = (
            word_spans[i + 1][0].start
            if (i + 1 < len(word_spans) and word_spans[i + 1])
            else num_frames - 1
        )
        max_f = max(e_frame, next_s_frame - 2)
        cur_f = e_frame
        silent_run = 0
        for f in range(e_frame, max_f):
            if smooth_rms[f] >= sustain_thresh:
                cur_f = f + 1
                silent_run = 0
            else:
                silent_run += 1
                if silent_run >= 9:
                    break
        s_sec = round(float(s_frame * ratio), 3)
        e_sec = round(float(max(s_sec + 0.08, cur_f * ratio)), 3)
        out_words.append({"word": w, "start": s_sec, "end": e_sec})

    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(out_words, f)

if __name__ == "__main__":
    main()
"#;

#[tauri::command]
fn check_system_capabilities() -> SystemCapabilities {
    let ffmpeg_found = search_binary(&["ffmpeg"]);
    let libass_available = ffmpeg_found
        .as_ref()
        .map(|(_, p)| check_ffmpeg_libass(p))
        .unwrap_or(false);

    let mms_py = find_mms_python();
    let whisper_found = if mms_py.is_some() {
        Some(("mms_fa".to_string(), mms_py.unwrap()))
    } else {
        search_binary(&["mlx_whisper", "whisper"])
    };

    SystemCapabilities {
        ffmpeg_available: ffmpeg_found.is_some(),
        ffmpeg_path: ffmpeg_found.map(|(_, p)| p.to_string_lossy().to_string()),
        libass_available,
        whisper_available: whisper_found.is_some(),
        whisper_engine: whisper_found.map(|(name, _)| name),
    }
}

#[tauri::command]
async fn transcribe_whisper_words(
    audio_base64: String,
    audio_ext: String,
    lyric_words: Option<Vec<String>>,
) -> Result<WhisperAlignmentResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let stamp = unique_stamp();
        let work_dir = env::temp_dir().join(format!("karaocraft_whisper_{}", stamp));
        fs::create_dir_all(&work_dir)
            .map_err(|e| format!("Failed to create temp directory: {}", e))?;

        let ext = audio_ext
            .trim_start_matches('.')
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>();
        let safe_ext = if ext.is_empty() { "mp3".to_string() } else { ext };
        let audio_path = work_dir.join(format!("vocal.{}", safe_ext));

        let audio_bytes = decode_base64(&audio_base64)?;
        fs::write(&audio_path, audio_bytes)
            .map_err(|e| format!("Failed to write temp audio file: {}", e))?;

        let existing_path = env::var("PATH").unwrap_or_default();
        let enriched_path = format!("/opt/homebrew/bin:/usr/local/bin:{}", existing_path);

        // Tier 1: MMS_FA Phonetic Forced Alignment (when lyric_words & torchaudio+uroman are available)
        if let Some(ref req_words) = lyric_words {
            if !req_words.is_empty() {
                if let (Some(py_path), Some((_, ffmpeg_path))) =
                    (find_mms_python(), search_binary(&["ffmpeg"]))
                {
                    let script_path = work_dir.join("align_mms.py");
                    let words_in_path = work_dir.join("words_in.json");
                    let words_out_path = work_dir.join("words_out.json");

                    if fs::write(&script_path, MMS_ALIGNER_SCRIPT).is_ok()
                        && serde_json::to_string(req_words)
                            .ok()
                            .and_then(|s| fs::write(&words_in_path, s).ok())
                            .is_some()
                    {
                        let run = Command::new(&py_path)
                            .env("PATH", &enriched_path)
                            .arg(&script_path)
                            .arg(&audio_path)
                            .arg(&words_in_path)
                            .arg(&words_out_path)
                            .arg(&ffmpeg_path)
                            .output();

                        if let Ok(out) = run {
                            if out.status.success() && words_out_path.is_file() {
                                if let Ok(raw_json) = fs::read_to_string(&words_out_path) {
                                    if let Ok(parsed) =
                                        serde_json::from_str::<serde_json::Value>(&raw_json)
                                    {
                                        if let Some(arr) = parsed.as_array() {
                                            let mut mms_words = Vec::with_capacity(arr.len());
                                            for item in arr {
                                                let text = item
                                                    .get("word")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("")
                                                    .to_string();
                                                let start = item
                                                    .get("start")
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(0.0);
                                                let end = item
                                                    .get("end")
                                                    .and_then(|v| v.as_f64())
                                                    .unwrap_or(start + 0.08);
                                                mms_words.push(WhisperWord {
                                                    word: text,
                                                    start,
                                                    end,
                                                });
                                            }
                                            if mms_words.len() == req_words.len() {
                                                let _ = fs::remove_dir_all(&work_dir);
                                                return Ok(WhisperAlignmentResponse {
                                                    available: true,
                                                    engine: Some("mms_fa".to_string()),
                                                    exact_aligned: true,
                                                    words: mms_words,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Tier 2: Whisper CLI fallback
        let Some((engine_name, engine_path)) = search_binary(&["mlx_whisper", "whisper"]) else {
            let _ = fs::remove_dir_all(&work_dir);
            return Ok(WhisperAlignmentResponse {
                available: false,
                engine: None,
                exact_aligned: false,
                words: Vec::new(),
            });
        };

        let mut cmd = Command::new(&engine_path);
        cmd.env("PATH", enriched_path)
            .arg(&audio_path)
            .arg("--word_timestamps")
            .arg("True")
            .arg("--output_format")
            .arg("json")
            .arg("--output_dir")
            .arg(&work_dir);

        if engine_name == "whisper" {
            cmd.arg("--model").arg("base");
            cmd.arg("--fp16").arg("False");
        }

        let output = cmd.output();
        let json_path = work_dir.join("vocal.json");

        let mut words = Vec::new();
        if output.is_ok() && json_path.is_file() {
            if let Ok(raw_json) = fs::read_to_string(&json_path) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw_json) {
                    if let Some(segments) = parsed.get("segments").and_then(|s| s.as_array()) {
                        for seg in segments {
                            if let Some(seg_words) = seg.get("words").and_then(|w| w.as_array()) {
                                for w in seg_words {
                                    let text = w
                                        .get("word")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .trim()
                                        .to_string();
                                    let start =
                                        w.get("start").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                    let end =
                                        w.get("end").and_then(|v| v.as_f64()).unwrap_or(start);
                                    if !text.is_empty() {
                                        words.push(WhisperWord {
                                            word: text,
                                            start,
                                            end,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let _ = fs::remove_dir_all(&work_dir);

        Ok(WhisperAlignmentResponse {
            available: !words.is_empty(),
            engine: Some(engine_name),
            exact_aligned: false,
            words,
        })
    })
    .await
    .map_err(|e| format!("Whisper task panicked: {}", e))?
}

#[tauri::command]
async fn render_karaoke_mp4(request: RenderMp4Request) -> Result<RenderMp4Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some((_, ffmpeg_path)) = search_binary(&["ffmpeg"]) else {
            return Err(
                "FFmpeg was not found on your Mac. Install it via `brew install ffmpeg`."
                    .to_string(),
            );
        };

        let stamp = unique_stamp();
        let work_dir = env::temp_dir().join(format!("karaocraft_render_{}", stamp));
        fs::create_dir_all(&work_dir)
            .map_err(|e| format!("Failed to create render directory: {}", e))?;

        let ext = request
            .audio_ext
            .trim_start_matches('.')
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .collect::<String>();
        let safe_ext = if ext.is_empty() { "mp3".to_string() } else { ext };

        let audio_path = work_dir.join(format!("input.{}", safe_ext));
        let ass_path = work_dir.join("karaoke.ass");

        let audio_bytes = decode_base64(&request.audio_base64)?;
        fs::write(&audio_path, audio_bytes)
            .map_err(|e| format!("Failed to write audio stream: {}", e))?;
        fs::write(&ass_path, request.ass_content.as_bytes())
            .map_err(|e| format!("Failed to write ASS subtitles: {}", e))?;

        let home_dir = env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        let downloads_dir = PathBuf::from(&home_dir).join("Downloads");
        let target_dir = if downloads_dir.is_dir() {
            downloads_dir
        } else {
            PathBuf::from(&home_dir)
        };

        let base_name = sanitize_filename(&request.output_filename);
        let final_name = if base_name.to_lowercase().ends_with(".mp4") {
            base_name
        } else {
            format!("{}.mp4", base_name)
        };
        let output_path = target_dir.join(final_name);

        let hex_clean = request.bg_color.trim().trim_start_matches('#');
        let safe_hex = if hex_clean.len() == 6 && hex_clean.chars().all(|c| c.is_ascii_hexdigit()) {
            hex_clean.to_string()
        } else {
            "000000".to_string()
        };

        let duration = request.duration_sec.max(1.0);
        let color_src = format!(
            "color=c=0x{}:s={}x{}:r=30:d={:.3}",
            safe_hex, request.width, request.height, duration
        );
        let vf_arg = "ass=karaoke.ass";
        let bitrate = if request.height >= 1080 { "8M" } else { "4M" };

        // Attempt 1: Apple Silicon Hardware Encoder (h264_videotoolbox)
        let hw_run = Command::new(&ffmpeg_path)
            .current_dir(&work_dir)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                &color_src,
                "-i",
            ])
            .arg(&audio_path)
            .args([
                "-vf",
                vf_arg,
                "-c:v",
                "h264_videotoolbox",
                "-b:v",
                bitrate,
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "256k",
                "-shortest",
                "-movflags",
                "+faststart",
            ])
            .arg(&output_path)
            .output();

        if let Ok(out) = hw_run {
            if out.status.success() && output_path.is_file() {
                let _ = fs::remove_dir_all(&work_dir);
                return Ok(RenderMp4Response {
                    output_path: output_path.to_string_lossy().to_string(),
                    encoder_used: "Apple VideoToolbox (Hardware H.264)".to_string(),
                });
            }
        }

        // Attempt 2: Software libx264 fallback
        let sw_run = Command::new(&ffmpeg_path)
            .current_dir(&work_dir)
            .args([
                "-y",
                "-f",
                "lavfi",
                "-i",
                &color_src,
                "-i",
            ])
            .arg(&audio_path)
            .args([
                "-vf",
                vf_arg,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "256k",
                "-shortest",
                "-movflags",
                "+faststart",
            ])
            .arg(&output_path)
            .output()
            .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;

        let _ = fs::remove_dir_all(&work_dir);

        if !sw_run.status.success() {
            let stderr = String::from_utf8_lossy(&sw_run.stderr);
            let tail: String = stderr
                .lines()
                .rev()
                .take(8)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("
");
            return Err(format!("FFmpeg video render failed:
{}", tail));
        }

        Ok(RenderMp4Response {
            output_path: output_path.to_string_lossy().to_string(),
            encoder_used: "libx264 (Software H.264)".to_string(),
        })
    })
    .await
    .map_err(|e| format!("Render task panicked: {}", e))?
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("File no longer exists at path.".to_string());
    }
    Command::new("open")
        .arg("-R")
        .arg(&target)
        .spawn()
        .map_err(|e| format!("Failed to reveal file in Finder: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_system_capabilities,
            transcribe_whisper_words,
            render_karaoke_mp4,
            reveal_in_finder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
