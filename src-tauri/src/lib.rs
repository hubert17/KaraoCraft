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

#[tauri::command]
fn check_system_capabilities() -> SystemCapabilities {
    let ffmpeg_found = search_binary(&["ffmpeg"]);
    let libass_available = ffmpeg_found
        .as_ref()
        .map(|(_, p)| check_ffmpeg_libass(p))
        .unwrap_or(false);

    let whisper_found = search_binary(&["mlx_whisper", "whisper"]);

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
) -> Result<WhisperAlignmentResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some((engine_name, engine_path)) = search_binary(&["mlx_whisper", "whisper"]) else {
            return Ok(WhisperAlignmentResponse {
                available: false,
                engine: None,
                words: Vec::new(),
            });
        };

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

        // Ensure PATH includes /opt/homebrew/bin so Whisper can find ffmpeg
        let existing_path = env::var("PATH").unwrap_or_default();
        let enriched_path = format!("/opt/homebrew/bin:/usr/local/bin:{}", existing_path);

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
