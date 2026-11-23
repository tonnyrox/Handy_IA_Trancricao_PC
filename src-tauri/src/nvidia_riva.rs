//! NVIDIA Riva ASR (Parakeet) transcription over gRPC, for PT-BR cloud dictation.
//!
//! The proto-generated module comes from `proto/riva/proto/riva_asr.proto`
//! (compiled in build.rs via tonic-build). We use the unary `Recognize` RPC:
//! a WAV (16-bit mono) goes in, a transcript comes back.

use std::time::Duration;

use tonic::transport::{Channel, ClientTlsConfig, Endpoint};

use crate::nvidia_riva_proto::riva::asr::riva_speech_recognition_client::RivaSpeechRecognitionClient;
use crate::nvidia_riva_proto::riva::asr::{RecognizeRequest, RecognitionConfig, SpeechContext};
use crate::nvidia_riva_proto::riva::AudioEncoding;

const RIVA_URI: &str = "https://grpc.nvcf.nvidia.com:443";
const SERVER: &str = "grpc.nvcf.nvidia.com";
const LANGUAGE: &str = "pt-BR";
const SAMPLE_RATE: i32 = 16_000;

/// Classifica erros do gRPC/API em mensagens claras em PT-BR.
/// Erros de autenticação (401/403/Unauthenticated/PermissionDenied) recebem
/// uma instrução para gerar uma nova chave no build.nvidia.com.
pub fn classify_riva_error(err: &tonic::Status) -> String {
    let code = err.code();
    let msg = err.message();
    // B7: decidir SOMENTE pelo código gRPC. Procurar "401"/"403" no texto
    // causa falso alarme quando um id qualquer contém esses dígitos.
    let is_auth = matches!(
        code,
        tonic::Code::Unauthenticated | tonic::Code::PermissionDenied
    );

    if is_auth {
        return "Chave NVIDIA inválida ou expirada. Gere uma nova chave em https://build.nvidia.com/settings/api-keys e cole em Configurações > Modelos. Se o modelo foi trocado, atualize também o Function-ID."
            .to_string();
    }
    // Limite do plano gratuito (429 / ResourceExhausted) tem mensagem própria.
    if matches!(code, tonic::Code::ResourceExhausted) {
        return "Limite de requisições da NVIDIA atingido. Aguarde alguns instantes e tente novamente.".to_string();
    }
    format!("Falha na transcrição NVIDIA ({code:?}): {msg}")
}

/// Retorna true se o erro for de autenticação (chave expirada/inválida).
pub fn is_auth_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("chave nvidia inválida")
        || lower.contains("expirada")
        || lower.contains("unauthenticated")
        || lower.contains("permissiondenied")
        || lower.contains("403")
        || lower.contains("401")
}

/// Cria um runtime por chamada e conecta via gRPC. O canal cached com
/// connect_lazy (tentativa B5) travava a transcrição — revertido para o
/// comportamento que funcionava (conexão nova a cada fala, ~5s).
pub fn transcribe_audio_blocking(
    wav_bytes: Vec<u8>,
    api_key: &str,
    function_id: &str,
    custom_words: &[String],
) -> Result<String, String> {
    let api_key = api_key.to_string();
    let function_id = function_id.to_string();
    let custom_words = custom_words.to_vec();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create async runtime: {e}"))?;
        rt.block_on(transcribe_audio_with_retry(
            wav_bytes,
            &api_key,
            &function_id,
            &custom_words,
        ))
    })
    .join()
    .map_err(|_| "Riva transcription thread panicked".to_string())?
}

async fn transcribe_audio_with_retry(
    wav_bytes: Vec<u8>,
    api_key: &str,
    function_id: &str,
    custom_words: &[String],
) -> Result<String, String> {
    let mut attempt = 0;
    loop {
        match transcribe_audio(wav_bytes.clone(), api_key, function_id, custom_words).await {
            Ok(text) => return Ok(text),
            Err(e) => {
                attempt += 1;
                if attempt > 2 {
                    return Err(e);
                }
                if e.contains("Chave NVIDIA inválida")
                    || e.contains("Limite de requisições")
                {
                    return Err(e);
                }
                tokio::time::sleep(Duration::from_millis(300 * attempt as u64)).await;
            }
        }
    }
}

pub async fn transcribe_audio(
    wav_bytes: Vec<u8>,
    api_key: &str,
    function_id: &str,
    custom_words: &[String],
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("NVIDIA API key is not configured".to_string());
    }
    if function_id.trim().is_empty() {
        return Err("NVIDIA Riva function-id is not configured".to_string());
    }
    if wav_bytes.is_empty() {
        return Ok(String::new());
    }

    // Conexão nova por fala (comportamento estável) — confia no store de certificados do OS.
    let tls = ClientTlsConfig::new()
        .domain_name(SERVER)
        .with_native_roots();
    let endpoint = Endpoint::from_static(RIVA_URI)
        .tls_config(tls)
        .map_err(|e| format!("Riva TLS config failed: {e}"))?
        .timeout(Duration::from_secs(60));
    let channel: Channel = endpoint
        .connect()
        .await
        .map_err(|e| format!("Riva connect failed: {e}"))?;

    let key = api_key.trim().to_string();
    let fid = function_id.trim().to_string();
    let mut client = RivaSpeechRecognitionClient::with_interceptor(channel, move |mut req: tonic::Request<()>| {
        req.metadata_mut().insert(
            "authorization",
            format!("Bearer {key}").parse().map_err(|e| {
                tonic::Status::invalid_argument(format!("bad authorization metadata: {e}"))
            })?,
        );
        req.metadata_mut().insert(
            "function-id",
            fid.parse().map_err(|e| {
                tonic::Status::invalid_argument(format!("bad function-id metadata: {e}"))
            })?,
        );
        Ok(req)
    });

    let mut config = RecognitionConfig {
        encoding: AudioEncoding::LinearPcm as i32,
        sample_rate_hertz: SAMPLE_RATE,
        language_code: LANGUAGE.to_string(),
        max_alternatives: 1,
        enable_automatic_punctuation: true,
        verbatim_transcripts: false,
        // All other fields default to 0/false via prost.
        ..Default::default()
    };
    // Reforço de vocabulário: nomes próprios/termos técnicos do usuário.
    if !custom_words.is_empty() {
        config.speech_contexts = vec![SpeechContext {
            phrases: custom_words.to_vec(),
            boost: 10.0,
        }];
    }

    // B6: dividir áudio longo em trechos de ~30 s (960.000 samples a 16 kHz).
    // O WAV gerado por samples_to_wav_bytes tem header de 44 bytes; os samples
    // são PCM16 little-endian. Cada trecho é reencodado como WAV independente.
    const CHUNK_SAMPLES: usize = 480_000; // 30 s
    let audio_bytes = if wav_bytes.len() > 44 {
        &wav_bytes[44..]
    } else {
        &wav_bytes[..]
    };
    let total_samples = audio_bytes.len() / 2;
    let mut all_text = Vec::new();

    for chunk_start in (0..total_samples).step_by(CHUNK_SAMPLES) {
        let chunk_end = (chunk_start + CHUNK_SAMPLES).min(total_samples);
        let mut chunk_wav = make_wav_header(chunk_end - chunk_start);
        let start_byte = chunk_start * 2;
        let end_byte = chunk_end * 2;
        if start_byte <= audio_bytes.len() && end_byte <= audio_bytes.len() {
            chunk_wav.extend_from_slice(&audio_bytes[start_byte..end_byte]);
        }

        let request = RecognizeRequest {
            config: Some(config.clone()),
            audio: chunk_wav,
            ..Default::default()
        };

        let response = client
            .recognize(request)
            .await
            .map_err(|e| classify_riva_error(&e))?
            .into_inner();

        for result in response.results {
            if let Some(alt) = result.alternatives.into_iter().next() {
                let text = alt.transcript.trim().to_string();
                if !text.is_empty() {
                    all_text.push(text);
                }
            }
        }
    }

    // Silêncio não é erro: deixa o chamador tratar como "sem texto" sem toast.
    if all_text.is_empty() {
        return Ok(String::new());
    }
    Ok(all_text.join(" ").trim().to_string())
}

/// Header WAV de 44 bytes para PCM16 mono a 16 kHz com n samples.
fn make_wav_header(n_samples: usize) -> Vec<u8> {
    let data_len = (n_samples * 2) as u32;
    let mut h = Vec::with_capacity(44);
    h.extend_from_slice(b"RIFF");
    h.extend_from_slice(&(36u32.wrapping_add(data_len)).to_le_bytes());
    h.extend_from_slice(b"WAVE");
    h.extend_from_slice(b"fmt ");
    h.extend_from_slice(&16u32.to_le_bytes());
    h.extend_from_slice(&1u16.to_le_bytes()); // PCM
    h.extend_from_slice(&1u16.to_le_bytes()); // mono
    h.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    h.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // byte rate
    h.extend_from_slice(&2u16.to_le_bytes()); // block align
    h.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    h.extend_from_slice(b"data");
    h.extend_from_slice(&data_len.to_le_bytes());
    h
}
