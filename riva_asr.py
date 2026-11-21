r"""
Helper de transcricao PT-BR via NVIDIA Riva gRPC (Parakeet).
Usado pelos scripts de teste rapido. Sem buildar nada.
"""
import os
import tempfile

import riva.client


def _load_env():
    """Le .env local (simples, sem dependencias) para credenciais de teste."""
    env = {}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env


_ENV = _load_env()
CHAVE = os.environ.get("NVIDIA_API_KEY") or _ENV.get("NVIDIA_API_KEY", "")
FUNCTION_ID = os.environ.get("NVIDIA_FUNCTION_ID") or _ENV.get("NVIDIA_FUNCTION_ID", "")
SERVER = "grpc.nvcf.nvidia.com:443"
LANGUAGE = "pt-BR"


def transcrever_wav(wav_bytes):
    """Transcreve bytes WAV (16-bit mono) e devolve o texto em pt-BR."""
    auth = riva.client.Auth(
        use_ssl=True,
        uri=SERVER,
        metadata_args=[
            ["function-id", FUNCTION_ID],
            ["authorization", f"Bearer {CHAVE}"],
        ],
    )
    asr = riva.client.ASRService(auth)
    config = riva.client.StreamingRecognitionConfig(
        config=riva.client.RecognitionConfig(
            language_code=LANGUAGE,
            max_alternatives=1,
            enable_automatic_punctuation=True,
            verbatim_transcripts=False,
        ),
        interim_results=False,
    )

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    try:
        tmp.write(wav_bytes)
        tmp.close()
        texto = []
        with riva.client.AudioChunkFileIterator(tmp.name, 1600, None) as chunks:
            for resp in asr.streaming_response_generator(chunks, config):
                if resp.results:
                    for alt in resp.results[0].alternatives:
                        if alt.transcript:
                            texto.append(alt.transcript)
        return " ".join(texto).strip()
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass
