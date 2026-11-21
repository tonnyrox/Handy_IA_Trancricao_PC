r"""
Comparador de modelos NVIDIA com áudio PT-BR — testa antes de buildar.
Usa a última gravação em %APPDATA%\com.pais.handy\recordings\ (ou um .wav passado).

Uso:
  & "<venv>\Scripts\python.exe" "tools\comparar_modelos.py"
  & "...\python.exe" "tools\comparar_modelos.py" CAMINHO_DO_WAV
"""
import base64, json, os, sys, time, urllib.request, urllib.error

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = {}
for line in open(os.path.join(BASE, ".env"), encoding="utf-8"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        env[k] = v
KEY = env.get("NVIDIA_API_KEY", "")
HDRS = {"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Accept": "application/json"}

def ultimo_wav():
    rec = os.path.join(os.environ["APPDATA"], "com.pais.handy", "recordings")
    wavs = [os.path.join(rec, f) for f in os.listdir(rec) if f.lower().endswith(".wav")]
    return max(wavs, key=os.path.getmtime) if wavs else None

def listar_modelos():
    req = urllib.request.Request("https://integrate.api.nvidia.com/v1/models", headers=HDRS)
    return [m["id"] for m in json.loads(urllib.request.urlopen(req, timeout=30).read())["data"]]

def testar_modelo(model, b64):
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": "Transcreva exatamente o audio em portugues do Brasil. So o texto falado. NAO traduza."},
            {"type": "input_audio", "input_audio": {"data": b64, "format": "wav"}},
        ]}],
        "max_tokens": 256, "temperature": 0,
    }
    req = urllib.request.Request("https://integrate.api.nvidia.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"), headers=HDRS, method="POST")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            body = json.loads(r.read().decode("utf-8"))
        txt = body["choices"][0]["message"].get("content") or ""
        return time.time() - t0, True, txt.strip()
    except urllib.error.HTTPError as e:
        return time.time() - t0, False, f"HTTP {e.code}"
    except Exception as e:
        return time.time() - t0, False, type(e).__name__

def main():
    wav = sys.argv[1] if len(sys.argv) > 1 else ultimo_wav()
    if not wav or not os.path.isfile(wav):
        print("Nenhum .wav encontrado. Faca uma gravacao no app primeiro.")
        return
    print(f"Audio: {os.path.basename(wav)}\n")
    b64 = base64.b64encode(open(wav, "rb").read()).decode("ascii")
    print(f"{'MODELO':<52} {'TEMPO':>7}  STATUS")
    print("-" * 80)
    for model in listar_modelos():
        if "parakeet" in model:
            print(f"{model:<52} {'Riva':>7}  DISPONIVEL (ASR dedicado)")
            continue
        dt, ok, detail = testar_modelo(model, b64)
        status = "OK" if ok and detail and detail.lower() != "none" else "FALHOU"
        print(f"{model:<52} {dt:>6.1f}s  {status}  {detail[:50]}")

if __name__ == "__main__":
    main()
