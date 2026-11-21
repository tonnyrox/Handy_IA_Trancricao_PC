//! Helpers compartilhados para transcrição cloud NVIDIA.
//!
//! A transcrição em si agora é feita via Riva gRPC (Parakeet) em `nvidia_riva.rs`.
//! Aqui ficam: conversão de samples para WAV, checagem de configuração e a
//! listagem de modelos disponíveis na chave (para o dropdown).

use hound::{SampleFormat, WavSpec, WavWriter};
use tauri::Manager;
use serde::Serialize;
use std::io::Cursor;

const NVIDIA_API_BASE: &str = "https://integrate.api.nvidia.com/v1";

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct NvidiaModelOption {
    pub id: String,
    pub label: String,
}

/// Resultado da checagem automática de um modelo com áudio real.
#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct NvidiaModelCheck {
    pub id: String,
    pub label: String,
    /// true quando o modelo realmente transcreveu o áudio.
    pub ok: bool,
    /// Duração do teste em milissegundos.
    pub duration_ms: u64,
    /// Trecho da transcrição (ou mensagem de erro), sem expor chaves.
    pub detail: String,
}

pub fn is_configured(api_key: &str) -> bool {
    !api_key.trim().is_empty()
}

pub fn samples_to_wav_bytes(samples: &[f32]) -> Result<Vec<u8>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer =
            WavWriter::new(&mut cursor, spec).map_err(|e| format!("Failed to create WAV: {e}"))?;
        for &sample in samples {
            let clamped = sample.clamp(-1.0, 1.0);
            let pcm = (clamped * i16::MAX as f32) as i16;
            writer
                .write_sample(pcm)
                .map_err(|e| format!("Failed to write WAV sample: {e}"))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("Failed to finalize WAV: {e}"))?;
    }
    Ok(cursor.into_inner())
}

#[derive(serde::Deserialize)]
struct ModelsResponse {
    data: Option<Vec<ApiModel>>,
}

#[derive(serde::Deserialize)]
struct ApiModel {
    id: Option<String>,
}

pub async fn list_models(api_key: &str, approved_ids: &[String]) -> Result<Vec<NvidiaModelOption>, String> {
    let fallback = vec![NvidiaModelOption {
        id: "nvidia/parakeet-1_1b-rnnt-multilingual-asr".to_string(),
        label: "NVIDIA Parakeet 1.1B Multilingual (gratuito e testado)".to_string(),
    }];
    if !is_configured(api_key) {
        return Ok(fallback);
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let response = client
        .get(format!("{NVIDIA_API_BASE}/models"))
        .header("Authorization", format!("Bearer {}", api_key.trim()))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch NVIDIA models: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read NVIDIA models response: {e}"))?;
    if !status.is_success() {
        // B3: cortar por caracteres, não por bytes (evita panic com acentos).
        let snippet: String = body.chars().take(300).collect();
        return Err(format!("NVIDIA models request failed ({status}): {snippet}"));
    }

    let parsed: ModelsResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse NVIDIA models response: {e}"))?;

    // A4: nenhuma heurística por nome. Só aparece o Parakeet (padrão, testado)
    // e os ids aprovados no "Verificar modelos" (persistidos em settings).
    let approved: std::collections::HashSet<&str> = approved_ids
        .iter()
        .map(|s| s.as_str())
        .collect();
    let parakeet = "nvidia/parakeet-1_1b-rnnt-multilingual-asr";

    let mut options: Vec<NvidiaModelOption> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for model in parsed.data.unwrap_or_default() {
        let Some(id) = model.id else { continue };
        let id = id.trim().to_string();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        let is_parakeet = id == parakeet;
        if !is_parakeet && !approved.contains(id.as_str()) {
            continue; // não testado/aprovado → não aparece
        }
        let label = if is_parakeet {
            "NVIDIA Parakeet 1.1B Multilingual (gratuito e testado)".to_string()
        } else {
            format!("{id} (gratuito, testado)")
        };
        options.push(NvidiaModelOption { label, id });
    }

    options.sort_by(|a, b| {
        let a_p = a.id == parakeet;
        let b_p = b.id == parakeet;
        b_p.cmp(&a_p).then_with(|| a.id.cmp(&b.id))
    });

    if options.is_empty() {
        return Ok(fallback);
    }
    Ok(options)
}

/// Retorna o caminho da gravação .wav mais recente do app, se houver.
pub fn latest_recording_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    // Usa a API de caminhos do Tauri (portátil), com fallback para APPDATA.
    let dir = app
        .path()
        .app_data_dir()
        .ok()
        .map(|p| p.join("recordings"))
        .or_else(|| {
            std::env::var("APPDATA")
                .ok()
                .map(|a| std::path::Path::new(&a).join("com.pais.handy").join("recordings"))
        })?;
    let mut files: Vec<_> = std::fs::read_dir(&dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("wav"))
                .unwrap_or(false)
        })
        .collect();
    // Mais recente primeiro.
    files.sort_by_key(|e| {
        std::cmp::Reverse(e.metadata().and_then(|m| m.modified()).ok())
    });
    files.first().map(|e| e.path())
}

/// Testa cada modelo da chave com a última gravação salva (por baixo do pano).
/// Modelos que não transcrevem (400/422/404/timeout/None) são marcados `ok=false`
/// para serem ocultados do dropdown. O Parakeet é sempre mantido (funciona via Riva).
pub async fn check_models_with_audio(
    api_key: &str,
    wav_bytes: Vec<u8>,
) -> Result<Vec<NvidiaModelCheck>, String> {
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use std::time::Instant;

    if !is_configured(api_key) {
        return Err("Chave NVIDIA não configurada".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let models = list_models(api_key, &[]).await?;
    let b64 = BASE64.encode(&wav_bytes);
    let mut results = Vec::new();

    for model in models {
        // O Parakeet é ASR dedicado via Riva gRPC: não é testado pelo chat,
        // mas é o modelo que sabemos que funciona → sempre disponível.
        if model.id.contains("parakeet") {
            results.push(NvidiaModelCheck {
                id: model.id,
                label: model.label,
                ok: true,
                duration_ms: 0,
                detail: "Disponível (ASR dedicado via Riva gRPC)".to_string(),
            });
            continue;
        }

        let started = Instant::now();
        let payload = serde_json::json!({
            "model": model.id,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "Transcreva exatamente o audio em portugues do Brasil. So o texto falado."},
                    {"type": "input_audio", "input_audio": {"data": b64, "format": "wav"}}
                ]
            }],
            "max_tokens": 256,
            "temperature": 0,
        });

        let response = client
            .post(format!("{NVIDIA_API_BASE}/chat/completions"))
            .header("Authorization", format!("Bearer {}", api_key.trim()))
            .json(&payload)
            .send()
            .await;

        let duration_ms = started.elapsed().as_millis() as u64;

        let check = match response {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = resp.json().await.unwrap_or_default();
                let transcript = body["choices"][0]["message"]["content"]
                    .as_str()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let ok = !transcript.is_empty()
                    && transcript.to_lowercase() != "none"
                    && !transcript.contains("não foi possível")
                    && !transcript.contains("não consigo")
                    && !transcript.contains("não foi enviado")
                    && !transcript.contains("no audio");
                let detail = if ok {
                    format!("Transcreveu: {}", {
                        let s: String = transcript.chars().take(80).collect();
                        s
                    })
                } else {
                    "Não transcreveu o áudio".to_string()
                };
                NvidiaModelCheck {
                    id: model.id,
                    label: model.label,
                    ok,
                    duration_ms,
                    detail,
                }
            }
            Ok(resp) => {
                let status = resp.status();
                NvidiaModelCheck {
                    id: model.id,
                    label: model.label,
                    ok: false,
                    duration_ms,
                    detail: format!("HTTP {status} — não aceita áudio"),
                }
            }
            Err(e) => NvidiaModelCheck {
                id: model.id,
                label: model.label,
                ok: false,
                duration_ms,
                detail: format!("Falha: {e}"),
            },
        };
        results.push(check);
    }

    // Disponíveis primeiro.
    results.sort_by(|a, b| {
        b.ok.cmp(&a.ok)
            .then_with(|| a.duration_ms.cmp(&b.duration_ms))
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(results)
}
