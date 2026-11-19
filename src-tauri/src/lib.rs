use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

static PREV_VERTICAL_BOUNDS: Mutex<Option<(i32, u32)>> = Mutex::new(None);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgressEvent {
    pub step: String,
    pub percent: u8,
    pub message: String,
}

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
    #[serde(default)]
    pub audio_path: Option<String>,
    #[serde(default)]
    pub audio_base64: String,
    pub audio_ext: String,
    #[serde(default)]
    pub audio_gain_db: Option<f64>,
    #[serde(default)]
    pub backing_vocal_path: Option<String>,
    #[serde(default)]
    pub backing_vocal_base64: Option<String>,
    #[serde(default)]
    pub backing_vocal_ext: Option<String>,
    #[serde(default)]
    pub backing_vocal_gain_db: Option<f64>,
    pub bg_color: String,
    pub bg_image_base64: Option<String>,
    pub bg_image_ext: Option<String>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedProjectFile {
    pub file_path: String,
    pub content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAudioFilePayload {
    pub file_path: String,
    pub file_name: String,
    pub base64_data: String,
    pub mime_type: String,
}

fn encode_base64(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity((input.len() + 2) / 3 * 4);
    let mut i = 0;
    while i + 3 <= input.len() {
        let n = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8) | (input[i + 2] as u32);
        out.push(TABLE[((n >> 18) & 0x3f) as usize]);
        out.push(TABLE[((n >> 12) & 0x3f) as usize]);
        out.push(TABLE[((n >> 6) & 0x3f) as usize]);
        out.push(TABLE[(n & 0x3f) as usize]);
        i += 3;
    }
    let rem = input.len() - i;
    if rem == 1 {
        let n = (input[i] as u32) << 16;
        out.push(TABLE[((n >> 18) & 0x3f) as usize]);
        out.push(TABLE[((n >> 12) & 0x3f) as usize]);
        out.push(b'=');
        out.push(b'=');
    } else if rem == 2 {
        let n = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8);
        out.push(TABLE[((n >> 18) & 0x3f) as usize]);
        out.push(TABLE[((n >> 12) & 0x3f) as usize]);
        out.push(TABLE[((n >> 6) & 0x3f) as usize]);
        out.push(b'=');
    }
    String::from_utf8(out).unwrap_or_default()
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

fn app_runtime_dir() -> PathBuf {
    if let Ok(home) = env::var("HOME") {
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("com.karaocraft.app")
    } else {
        env::temp_dir().join("com.karaocraft.app")
    }
}

fn search_binary(names: &[&str]) -> Option<(String, PathBuf)> {
    let runtime_bin = app_runtime_dir().join("bin");
    let mut search_dirs: Vec<PathBuf> = vec![
        runtime_bin,
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
    ];

    if let Ok(home) = env::var("HOME") {
        search_dirs.insert(1, PathBuf::from(&home).join(".local/bin"));
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
    let mut candidates: Vec<PathBuf> = vec![
        app_runtime_dir().join("venv/bin/python"),
        app_runtime_dir().join("venv/bin/python3"),
    ];
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

        let ass_path = work_dir.join("karaoke.ass");
        fs::write(&ass_path, request.ass_content.as_bytes())
            .map_err(|e| format!("Failed to write ASS subtitles: {}", e))?;

        let audio_path = if let Some(ref direct_path) = request.audio_path {
            let p = PathBuf::from(direct_path.trim());
            if p.is_file() {
                p
            } else {
                let fallback = work_dir.join(format!("input.{}", safe_ext));
                let audio_bytes = decode_base64(&request.audio_base64)?;
                fs::write(&fallback, audio_bytes)
                    .map_err(|e| format!("Failed to write audio stream: {}", e))?;
                fallback
            }
        } else {
            let fallback = work_dir.join(format!("input.{}", safe_ext));
            let audio_bytes = decode_base64(&request.audio_base64)?;
            fs::write(&fallback, audio_bytes)
                .map_err(|e| format!("Failed to write audio stream: {}", e))?;
            fallback
        };

        let mut backing_vocal_path: Option<PathBuf> = None;
        if let Some(ref bv_direct) = request.backing_vocal_path {
            let p = PathBuf::from(bv_direct.trim());
            if p.is_file() {
                backing_vocal_path = Some(p);
            }
        }
        if backing_vocal_path.is_none() {
            if let Some(ref bv_b64) = request.backing_vocal_base64 {
                if !bv_b64.trim().is_empty() {
                    let bv_bytes = decode_base64(bv_b64)?;
                    let raw_bv_ext = request
                        .backing_vocal_ext
                        .as_deref()
                        .unwrap_or("flac")
                        .trim_start_matches('.')
                        .chars()
                        .filter(|c| c.is_ascii_alphanumeric())
                        .collect::<String>();
                    let safe_bv_ext = if raw_bv_ext.is_empty() {
                        "flac".to_string()
                    } else {
                        raw_bv_ext
                    };
                    let bv_file = work_dir.join(format!("backing.{}", safe_bv_ext));
                    fs::write(&bv_file, bv_bytes)
                        .map_err(|e| format!("Failed to write backing vocal stream: {}", e))?;
                    backing_vocal_path = Some(bv_file);
                }
            }
        }

        let audio_gain_db = request.audio_gain_db.unwrap_or(0.0).clamp(-12.0, 6.0);
        let backing_gain_db = request.backing_vocal_gain_db.unwrap_or(0.0).clamp(-12.0, 6.0);
        let enable_limiter = audio_gain_db >= 3.0
            || (backing_vocal_path.is_some() && backing_gain_db >= 3.0);

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
        let duration_str = format!("{:.3}", duration);
        let color_src = format!(
            "color=c=0x{}:s={}x{}:r=30:d={:.3}",
            safe_hex, request.width, request.height, duration
        );

        // Optional Background Image pre-processing: scale to fill (maintain aspect ratio, no black bars) & center-crop
        let mut prepared_bg_path: Option<PathBuf> = None;
        if let Some(ref bg_b64) = request.bg_image_base64 {
            if !bg_b64.trim().is_empty() {
                if let Ok(bg_bytes) = decode_base64(bg_b64) {
                    let raw_ext = request
                        .bg_image_ext
                        .as_deref()
                        .unwrap_or("png")
                        .trim_start_matches('.')
                        .chars()
                        .filter(|c| c.is_ascii_alphanumeric())
                        .collect::<String>();
                    let safe_img_ext = if raw_ext.is_empty() {
                        "png".to_string()
                    } else {
                        raw_ext
                    };
                    let raw_bg_path = work_dir.join(format!("bg_raw.{}", safe_img_ext));
                    let prep_path = work_dir.join("bg_prepared.png");
                    if fs::write(&raw_bg_path, bg_bytes).is_ok() {
                        let base_color_1s = format!(
                            "color=c=0x{}:s={}x{}:r=1:d=1",
                            safe_hex, request.width, request.height
                        );
                        let fc = format!(
                            "[1:v]scale={}:{}:force_original_aspect_ratio=increase,crop={}:{},setsar=1[fg];[0:v][fg]overlay=0:0:shortest=1",
                            request.width, request.height, request.width, request.height
                        );
                        let prep_run = Command::new(&ffmpeg_path)
                            .current_dir(&work_dir)
                            .args(["-y", "-f", "lavfi", "-i", &base_color_1s, "-i"])
                            .arg(&raw_bg_path)
                            .args(["-filter_complex", &fc, "-frames:v", "1"])
                            .arg(&prep_path)
                            .output();
                        if prep_run.map(|o| o.status.success()).unwrap_or(false)
                            && prep_path.is_file()
                        {
                            prepared_bg_path = Some(prep_path);
                        }
                    }
                }
            }
        }

        let vf_arg = "ass=karaoke.ass";
        let bitrate = if request.height >= 1080 { "8M" } else { "4M" };

        let build_render_cmd = |video_codec_args: &[&str]| -> Command {
            let mut cmd = Command::new(&ffmpeg_path);
            cmd.current_dir(&work_dir).arg("-y");
            if let Some(ref bg_img) = prepared_bg_path {
                cmd.args(["-loop", "1", "-framerate", "30", "-t", &duration_str, "-i"])
                    .arg(bg_img);
            } else {
                cmd.args(["-f", "lavfi", "-i", &color_src]);
            }
            cmd.arg("-i").arg(&audio_path);

            if let Some(ref bv_path) = backing_vocal_path {
                cmd.arg("-i").arg(bv_path);
                let limiter_suffix = if enable_limiter {
                    ",alimiter=limit=0.95:attack=5:release=50"
                } else {
                    ""
                };
                let fc = format!(
                    "[0:v]{}[vout];[1:a]volume={:.2}dB[a1];[2:a]volume={:.2}dB[a2];[a1][a2]amix=inputs=2:duration=longest:normalize=0{}[aout]",
                    vf_arg, audio_gain_db, backing_gain_db, limiter_suffix
                );
                cmd.args(["-filter_complex", &fc, "-map", "[vout]", "-map", "[aout]"]);
            } else {
                cmd.args(["-vf", vf_arg]);
                if audio_gain_db.abs() > 0.01 {
                    let af = if enable_limiter {
                        format!(
                            "volume={:.2}dB,alimiter=limit=0.95:attack=5:release=50",
                            audio_gain_db
                        )
                    } else {
                        format!("volume={:.2}dB", audio_gain_db)
                    };
                    cmd.args(["-af", &af]);
                }
            }

            cmd.args(video_codec_args)
                .args([
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
                .arg(&output_path);
            cmd
        };

        // Attempt 1: Apple Silicon Hardware Encoder (h264_videotoolbox)
        let hw_run = build_render_cmd(&["-c:v", "h264_videotoolbox", "-b:v", bitrate]).output();

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
        let sw_run = build_render_cmd(&["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"])
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

fn find_audio_path_on_disk(file_name: &str, file_size: Option<u64>) -> Option<PathBuf> {
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(home) = env::var("HOME") {
        let home_pb = PathBuf::from(&home);
        for sub in ["Downloads", "Music", "Pictures", "Desktop", "Documents"] {
            let p = home_pb.join(sub).join(trimmed);
            if p.is_file() {
                candidates.push(p);
            }
        }
    }

    let escaped = trimmed.replace('\'', "\\'");
    let query = format!("kMDItemFSName == '{}'", escaped);
    if let Ok(out) = Command::new("mdfind").arg(&query).output() {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let p = PathBuf::from(line.trim());
                if p.is_file() && !candidates.contains(&p) {
                    candidates.push(p);
                }
            }
        }
    }

    if let Some(target_size) = file_size {
        for c in &candidates {
            if let Ok(meta) = fs::metadata(c) {
                if meta.len() == target_size {
                    return Some(c.clone());
                }
            }
        }
    }

    candidates.into_iter().next()
}

fn infer_audio_mime(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "wav" => "audio/wav".to_string(),
        "mp3" => "audio/mpeg".to_string(),
        "m4a" | "aac" => "audio/mp4".to_string(),
        "flac" => "audio/flac".to_string(),
        "ogg" | "opus" => "audio/ogg".to_string(),
        "mp4" => "video/mp4".to_string(),
        _ => "audio/mpeg".to_string(),
    }
}

fn infer_image_mime(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "webp" => "image/webp".to_string(),
        "gif" => "image/gif".to_string(),
        "bmp" => "image/bmp".to_string(),
        "svg" => "image/svg+xml".to_string(),
        _ => "image/png".to_string(),
    }
}

fn read_image_payload_from_path(target_path: &Path) -> Result<LocalAudioFilePayload, String> {
    let ext = target_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let name = target_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("background.png")
        .to_string();

    // If user selected HEIC/HEIF/TIFF on macOS, convert in-memory bytes via `sips` so WebView & FFmpeg render seamlessly
    if matches!(ext.as_str(), "heic" | "heif" | "tif" | "tiff") {
        let tmp_png = env::temp_dir().join(format!("karaocraft_bg_{}.png", unique_stamp()));
        let sips_ok = Command::new("sips")
            .args(["-s", "format", "png"])
            .arg(target_path)
            .arg("--out")
            .arg(&tmp_png)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if sips_ok && tmp_png.is_file() {
            if let Ok(png_bytes) = fs::read(&tmp_png) {
                let _ = fs::remove_file(&tmp_png);
                return Ok(LocalAudioFilePayload {
                    file_path: target_path.to_string_lossy().to_string(),
                    file_name: name,
                    base64_data: encode_base64(&png_bytes),
                    mime_type: "image/png".to_string(),
                });
            }
            let _ = fs::remove_file(&tmp_png);
        }
    }

    let bytes = fs::read(target_path).map_err(|e| {
        format!(
            "Could not read image file '{}': {}",
            target_path.display(),
            e
        )
    })?;
    let mime_type = infer_image_mime(target_path);

    Ok(LocalAudioFilePayload {
        file_path: target_path.to_string_lossy().to_string(),
        file_name: name,
        base64_data: encode_base64(&bytes),
        mime_type,
    })
}

#[tauri::command]
fn resolve_local_audio_path(file_name: String, file_size: Option<u64>) -> Option<String> {
    find_audio_path_on_disk(&file_name, file_size).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
async fn read_local_image_file(
    file_path: Option<String>,
    file_name: Option<String>,
) -> Result<LocalAudioFilePayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut resolved: Option<PathBuf> = None;

        if let Some(ref fp) = file_path {
            let p = PathBuf::from(fp.trim());
            if p.is_file() {
                resolved = Some(p);
            }
        }

        if resolved.is_none() {
            if let Some(ref fnm) = file_name {
                resolved = find_audio_path_on_disk(fnm, None);
            } else if let Some(ref fp) = file_path {
                if let Some(base) = Path::new(fp).file_name().and_then(|s| s.to_str()) {
                    resolved = find_audio_path_on_disk(base, None);
                }
            }
        }

        let Some(target_path) = resolved else {
            let label = file_path
                .or(file_name)
                .unwrap_or_else(|| "image file".to_string());
            return Err(format!("Background image file not found at: {}", label));
        };

        read_image_payload_from_path(&target_path)
    })
    .await
    .map_err(|e| format!("Read image task panicked: {}", e))?
}

#[tauri::command]
async fn open_image_dialog(
    prompt: Option<String>,
    initial_dir: Option<String>,
) -> Result<Option<LocalAudioFilePayload>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let default_pictures = env::var("HOME")
            .ok()
            .map(|h| PathBuf::from(h).join("Pictures").to_string_lossy().to_string());
        let start_dir = resolve_dialog_dir(initial_dir.as_deref(), default_pictures.as_deref());
        let title = prompt.unwrap_or_else(|| "Select Background Image".to_string());

        let script = r#"
            on run argv
                set dlgPrompt to item 1 of argv
                set defDir to POSIX file (item 2 of argv)
                try
                    set chosenFile to choose file with prompt dlgPrompt of type {"public.image", "png", "jpg", "jpeg", "webp", "heic", "bmp", "gif", "tiff"} default location defDir
                    return POSIX path of chosenFile
                on error number -128
                    return ""
                end try
            end run
        "#;

        let out = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(&title)
            .arg(start_dir.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Failed to open image file dialog: {}", e))?;

        let chosen = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if chosen.is_empty() {
            return Ok(None);
        }

        let target_path = PathBuf::from(&chosen);
        let payload = read_image_payload_from_path(&target_path)?;
        Ok(Some(payload))
    })
    .await
    .map_err(|e| format!("Open image dialog task panicked: {}", e))?
}

#[tauri::command]
async fn read_local_audio_file(
    file_path: Option<String>,
    file_name: Option<String>,
) -> Result<LocalAudioFilePayload, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut resolved: Option<PathBuf> = None;

        if let Some(ref fp) = file_path {
            let p = PathBuf::from(fp.trim());
            if p.is_file() {
                resolved = Some(p);
            }
        }

        if resolved.is_none() {
            if let Some(ref fnm) = file_name {
                resolved = find_audio_path_on_disk(fnm, None);
            } else if let Some(ref fp) = file_path {
                if let Some(base) = Path::new(fp).file_name().and_then(|s| s.to_str()) {
                    resolved = find_audio_path_on_disk(base, None);
                }
            }
        }

        let Some(target_path) = resolved else {
            let label = file_path
                .or(file_name)
                .unwrap_or_else(|| "audio file".to_string());
            return Err(format!("Audio file not found at: {}", label));
        };

        let bytes = fs::read(&target_path)
            .map_err(|e| format!("Could not read audio file '{}': {}", target_path.display(), e))?;
        let name = target_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("vocal.wav")
            .to_string();
        let mime_type = infer_audio_mime(&target_path);

        Ok(LocalAudioFilePayload {
            file_path: target_path.to_string_lossy().to_string(),
            file_name: name,
            base64_data: encode_base64(&bytes),
            mime_type,
        })
    })
    .await
    .map_err(|e| format!("Read audio task panicked: {}", e))?
}

#[tauri::command]
async fn find_sibling_backing_vocal(
    instrumental_path: String,
) -> Result<Option<LocalAudioFilePayload>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let inst = PathBuf::from(instrumental_path.trim());
        let Some(parent) = inst.parent() else {
            return Ok(None);
        };
        if !parent.is_dir() {
            return Ok(None);
        }
        let Some(inst_stem) = inst.file_stem().and_then(|s| s.to_str()) else {
            return Ok(None);
        };
        let inst_ext_lower = inst
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        // Strip common instrumental suffixes (case-insensitive) to derive the base track name
        let inst_stem_lower = inst_stem.to_lowercase();
        let inst_suffixes = [
            "_instrumental",
            "-instrumental",
            " (instrumental)",
            " [instrumental]",
            " instrumental",
        ];
        let mut base_name: Option<String> = None;
        for suffix in inst_suffixes {
            if inst_stem_lower.ends_with(suffix) && inst_stem.len() > suffix.len() {
                // Safe char-boundary slicing: suffix is pure ASCII
                let cut = inst_stem.len() - suffix.len();
                if inst_stem.is_char_boundary(cut) {
                    base_name = Some(inst_stem[..cut].to_string());
                    break;
                }
            }
        }
        let Some(base) = base_name else {
            return Ok(None);
        };

        let base_lower = base.to_lowercase();
        let backing_suffixes = [
            "_vocals_backing",
            "_backing_vocals",
            "_backing",
            " (backing vocals)",
            " [backing vocals]",
            " (backing)",
            "-vocals-backing",
            "-backing-vocals",
        ];
        let audio_exts = ["flac", "wav", "mp3", "m4a", "aac", "ogg", "opus"];

        let Ok(entries) = fs::read_dir(parent) else {
            return Ok(None);
        };

        let mut best_match: Option<(usize, bool, PathBuf)> = None;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() || path == inst {
                continue;
            }
            let Some(ext) = path.extension().and_then(|s| s.to_str()) else {
                continue;
            };
            let ext_lower = ext.to_lowercase();
            if !audio_exts.contains(&ext_lower.as_str()) {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            let stem_lower = stem.to_lowercase();
            if !stem_lower.starts_with(&base_lower) {
                continue;
            }
            let remainder = &stem_lower[base_lower.len()..];
            if let Some(priority) = backing_suffixes.iter().position(|s| *s == remainder) {
                let same_ext = !inst_ext_lower.is_empty() && ext_lower == inst_ext_lower;
                let replace = match &best_match {
                    None => true,
                    Some((best_prio, best_same_ext, _)) => {
                        priority < *best_prio || (priority == *best_prio && same_ext && !*best_same_ext)
                    }
                };
                if replace {
                    best_match = Some((priority, same_ext, path));
                }
            }
        }

        let Some((_, _, target_path)) = best_match else {
            return Ok(None);
        };

        let bytes = fs::read(&target_path).map_err(|e| {
            format!(
                "Could not read backing vocal file '{}': {}",
                target_path.display(),
                e
            )
        })?;
        let name = target_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("backing.flac")
            .to_string();
        let mime_type = infer_audio_mime(&target_path);

        Ok(Some(LocalAudioFilePayload {
            file_path: target_path.to_string_lossy().to_string(),
            file_name: name,
            base64_data: encode_base64(&bytes),
            mime_type,
        }))
    })
    .await
    .map_err(|e| format!("Find sibling backing vocal task panicked: {}", e))?
}

fn resolve_dialog_dir(primary: Option<&str>, fallback: Option<&str>) -> PathBuf {
    for candidate in [primary, fallback].into_iter().flatten() {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        let p = Path::new(trimmed);
        if p.is_dir() {
            return p.to_path_buf();
        }
        if let Some(parent) = p.parent() {
            if parent.is_dir() {
                return parent.to_path_buf();
            }
        }
    }
    env::var("HOME")
        .ok()
        .map(|h| PathBuf::from(h).join("Downloads"))
        .filter(|d| d.is_dir())
        .unwrap_or_else(|| PathBuf::from("/tmp"))
}

#[tauri::command]
async fn open_audio_dialog(
    prompt: Option<String>,
    initial_dir: Option<String>,
) -> Result<Option<LocalAudioFilePayload>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start_dir = resolve_dialog_dir(initial_dir.as_deref(), None);
        let title = prompt.unwrap_or_else(|| "Select Audio File".to_string());

        let script = r#"
            on run argv
                set dlgPrompt to item 1 of argv
                set defDir to POSIX file (item 2 of argv)
                try
                    set chosenFile to choose file with prompt dlgPrompt of type {"public.audio", "public.movie", "wav", "mp3", "m4a", "flac", "aac", "ogg", "opus", "mp4"} default location defDir
                    return POSIX path of chosenFile
                on error number -128
                    return ""
                end try
            end run
        "#;

        let out = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(&title)
            .arg(start_dir.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Failed to open audio file dialog: {}", e))?;

        let chosen = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if chosen.is_empty() {
            return Ok(None);
        }

        let target_path = PathBuf::from(&chosen);
        let bytes = fs::read(&target_path).map_err(|e| {
            format!(
                "Could not read audio file '{}': {}",
                target_path.display(),
                e
            )
        })?;
        let name = target_path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("audio.wav")
            .to_string();
        let mime_type = infer_audio_mime(&target_path);

        Ok(Some(LocalAudioFilePayload {
            file_path: chosen,
            file_name: name,
            base64_data: encode_base64(&bytes),
            mime_type,
        }))
    })
    .await
    .map_err(|e| format!("Open audio dialog task panicked: {}", e))?
}

#[tauri::command]
async fn open_project_dialog(
    initial_dir: Option<String>,
) -> Result<Option<OpenedProjectFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start_dir = resolve_dialog_dir(initial_dir.as_deref(), None);
        let script = r#"
            on run argv
                set defDir to POSIX file (item 1 of argv)
                try
                    set chosenFile to choose file with prompt "Open KaraoCraft Project (.json)" of type {"json", "public.json"} default location defDir
                    return POSIX path of chosenFile
                on error number -128
                    return ""
                end try
            end run
        "#;
        let out = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(start_dir.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Failed to open file dialog: {}", e))?;

        let chosen = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if chosen.is_empty() {
            return Ok(None);
        }

        let content = fs::read_to_string(&chosen)
            .map_err(|e| format!("Could not read project file '{}': {}", chosen, e))?;

        Ok(Some(OpenedProjectFile {
            file_path: chosen,
            content,
        }))
    })
    .await
    .map_err(|e| format!("Open project dialog task panicked: {}", e))?
}

#[tauri::command]
async fn save_project_dialog(
    default_name: String,
    current_path: Option<String>,
    initial_dir: Option<String>,
    content: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start_dir = resolve_dialog_dir(current_path.as_deref(), initial_dir.as_deref());

        let script = r#"
            on run argv
                set defName to item 1 of argv
                set defDir to POSIX file (item 2 of argv)
                try
                    set chosenFile to choose file name with prompt "Save KaraoCraft Project (.karaocraft.json)" default name defName default location defDir
                    return POSIX path of chosenFile
                on error number -128
                    return ""
                end try
            end run
        "#;

        let out = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .arg(&default_name)
            .arg(start_dir.to_string_lossy().to_string())
            .output()
            .map_err(|e| format!("Failed to open save dialog: {}", e))?;

        let mut chosen = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if chosen.is_empty() {
            return Ok(None);
        }

        if !chosen.to_lowercase().ends_with(".json") {
            chosen.push_str(".karaocraft.json");
        }

        fs::write(&chosen, content.as_bytes())
            .map_err(|e| format!("Failed to save project file '{}': {}", chosen, e))?;

        Ok(Some(chosen))
    })
    .await
    .map_err(|e| format!("Save project dialog task panicked: {}", e))?
}

#[tauri::command]
fn write_project_file(file_path: String, content: String) -> Result<String, String> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Project file path is empty.".to_string());
    }
    fs::write(trimmed, content.as_bytes())
        .map_err(|e| format!("Failed to save project file '{}': {}", trimmed, e))?;
    Ok(trimmed.to_string())
}

#[tauri::command]
fn start_window_drag(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_window_maximize(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }

    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "No monitor found".to_string())?;

    let work = monitor.work_area();
    let work_y = work.position.y;
    let work_h = work.size.height;

    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let keep_x = pos.x;
    let keep_w = size.width;

    let mut guard = PREV_VERTICAL_BOUNDS
        .lock()
        .map_err(|_| "Lock error".to_string())?;

    let is_full_height =
        (pos.y - work_y).abs() <= 24 && (size.height as i32 - work_h as i32).abs() <= 24;

    if is_full_height {
        if let Some((saved_y, saved_h)) = guard.take() {
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                keep_w, saved_h,
            )));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                keep_x, saved_y,
            )));
            return Ok(());
        }
    }

    *guard = Some((pos.y, size.height));
    let target_pos = tauri::Position::Physical(tauri::PhysicalPosition::new(keep_x, work_y));
    let target_size = tauri::Size::Physical(tauri::PhysicalSize::new(keep_w, work_h));
    window.set_position(target_pos).map_err(|e| e.to_string())?;
    window.set_size(target_size).map_err(|e| e.to_string())?;
    window.set_position(target_pos).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn install_runtime_dependencies(app: tauri::AppHandle) -> Result<SystemCapabilities, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let emit_progress = |step: &str, percent: u8, message: &str| {
            let _ = app.emit(
                "setup-progress",
                SetupProgressEvent {
                    step: step.to_string(),
                    percent,
                    message: message.to_string(),
                },
            );
        };

        let runtime_dir = app_runtime_dir();
        let bin_dir = runtime_dir.join("bin");
        let venv_dir = runtime_dir.join("venv");
        fs::create_dir_all(&bin_dir)
            .map_err(|e| format!("Failed to create runtime directory: {}", e))?;

        let existing_path = env::var("PATH").unwrap_or_default();
        let enriched_path = format!(
            "{}:/opt/homebrew/bin:/usr/local/bin:{}",
            bin_dir.display(),
            existing_path
        );

        // Step 1: Ensure FFmpeg is available
        emit_progress("ffmpeg", 10, "Checking FFmpeg video engine...");
        if search_binary(&["ffmpeg"]).is_none() {
            emit_progress("ffmpeg", 18, "Downloading FFmpeg for macOS...");
            if let Some((_, brew_bin)) = search_binary(&["brew"]) {
                let _ = Command::new(brew_bin)
                    .env("PATH", &enriched_path)
                    .args(["install", "ffmpeg"])
                    .status();
            }
            if search_binary(&["ffmpeg"]).is_none() {
                let zip_path = bin_dir.join("ffmpeg.zip");
                let target_ffmpeg = bin_dir.join("ffmpeg");
                let dl = Command::new("curl")
                    .args([
                        "-L",
                        "-sS",
                        "--fail",
                        "https://evermeet.cx/ffmpeg/getrelease/zip",
                        "-o",
                    ])
                    .arg(&zip_path)
                    .status();
                if dl.map(|s| s.success()).unwrap_or(false) && zip_path.is_file() {
                    let _ = Command::new("unzip")
                        .args(["-o", "-q"])
                        .arg(&zip_path)
                        .arg("-d")
                        .arg(&bin_dir)
                        .status();
                    let _ = fs::remove_file(&zip_path);
                    let _ = Command::new("chmod").arg("+x").arg(&target_ffmpeg).status();
                }
            }
        }

        // Step 2: Ensure uv + Python 3.10 venv + torchaudio, uroman, pykakasi
        emit_progress("python", 35, "Checking AI lyrics alignment runtime...");
        if find_mms_python().is_none() {
            let uv_bin = if let Some((_, existing_uv)) = search_binary(&["uv"]) {
                existing_uv
            } else {
                emit_progress("python", 42, "Installing lightweight Python package manager (uv)...");
                let install_cmd = format!(
                    "curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR='{}' sh",
                    bin_dir.display()
                );
                let _ = Command::new("sh").args(["-c", &install_cmd]).status();
                bin_dir.join("uv")
            };

            if !uv_bin.is_file() {
                return Err("Could not install uv package manager. Please check your internet connection.".to_string());
            }

            emit_progress("python", 55, "Creating isolated Python 3.10 environment...");
            let venv_status = Command::new(&uv_bin)
                .env("PATH", &enriched_path)
                .args(["venv", "--python", "3.10"])
                .arg(&venv_dir)
                .status()
                .map_err(|e| format!("Failed to create Python venv: {}", e))?;

            if !venv_status.success() {
                return Err("Failed to initialize Python 3.10 virtual environment.".to_string());
            }

            emit_progress(
                "packages",
                68,
                "Installing PyTorch Audio & universal phonetic libraries (torchaudio, uroman, pykakasi)...",
            );
            let venv_py = venv_dir.join("bin/python");
            let pip_status = Command::new(&uv_bin)
                .env("PATH", &enriched_path)
                .args([
                    "pip",
                    "install",
                    "--python",
                    &venv_py.to_string_lossy(),
                    "torchaudio",
                    "uroman",
                    "pykakasi",
                    "numpy",
                ])
                .status()
                .map_err(|e| format!("Failed to install AI packages: {}", e))?;

            if !pip_status.success() {
                return Err("Failed to install torchaudio and phonetic alignment packages.".to_string());
            }
        }

        // Step 3: Ensure MMS_FA model checkpoint is downloaded and cached
        if let Some(py_bin) = find_mms_python() {
            emit_progress(
                "model",
                85,
                "Downloading & verifying Meta MMS_FA phonetic alignment model (one-time setup)...",
            );
            let _ = Command::new(&py_bin)
                .env("PATH", &enriched_path)
                .args([
                    "-c",
                    "from torchaudio.pipelines import MMS_FA; MMS_FA.get_model(with_star=True)",
                ])
                .status();
        }

        emit_progress("done", 100, "KaraoCraft studio setup complete!");
        Ok(check_system_capabilities())
    })
    .await
    .map_err(|e| format!("Installer task panicked: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_system_capabilities,
            transcribe_whisper_words,
            render_karaoke_mp4,
            reveal_in_finder,
            resolve_local_audio_path,
            read_local_audio_file,
            find_sibling_backing_vocal,
            read_local_image_file,
            open_audio_dialog,
            open_image_dialog,
            open_project_dialog,
            save_project_dialog,
            write_project_file,
            start_window_drag,
            toggle_window_maximize,
            install_runtime_dependencies
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
