r"""
Teste dourado PT-BR — mede a revisão gramatical do par modelo+prompt real do dia a dia.

Por padrão usa GROQ_API_KEY + openai/gpt-oss-120b (o revisor do fork).
Se GROQ_API_KEY não existir, cai para NVIDIA_API_KEY + Nemotron (legado).

Uso:
  & "<venv>\Scripts\python.exe" "tools\golden_test.py"

A chave vem de .env (gitignore) ou variável de ambiente — nunca versionada.
Meta: >= 8/10, tempo <= 8s por frase.
"""
import io, json, os, re, time, urllib.request, urllib.error

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

env = {}
p = os.path.join(BASE, ".env")
if os.path.isfile(p):
    for line in io.open(p, encoding="utf-8"):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            env[k] = v

GROQ_KEY = os.environ.get("GROQ_API_KEY") or env.get("GROQ_API_KEY", "")
NVIDIA_KEY = os.environ.get("NVIDIA_API_KEY") or env.get("NVIDIA_API_KEY", "")

if GROQ_KEY:
    KEY = GROQ_KEY
    URL = "https://api.groq.com/openai/v1/chat/completions"
    MODEL = "openai/gpt-oss-120b"
    PROVIDER = "Groq"
else:
    KEY = NVIDIA_KEY
    URL = "https://integrate.api.nvidia.com/v1/chat/completions"
    MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"
    PROVIDER = "NVIDIA"

PROMPT = """Você é um revisor de português do Brasil. Corrija APENAS o necessário na transcrição abaixo.

REGRAS:
1. Ortografia e acentuação (inclusive crase: a/à/há).
2. Concordância verbal e nominal; regência; colocação pronominal.
2b. Converta números falados por extenso em algarismos — isso é CORREÇÃO, não perda de conteúdo: 'vinte e três' -> '23', 'dez por cento' -> '10%', 'mil duzentos e cinquenta reais e noventa centavos' -> 'R$ 1.250,90', 'às quinze horas' -> 'às 15h'.
3. Pontuação: vírgulas críticas (NUNCA entre sujeito e verbo; SEMPRE após oração adverbial inicial), ponto final (.) para afirmação, (?) para TODA pergunta e (!) para exclamação.
5. APENAS se a transcrição for exclusivamente ruído sem NENHUMA palavra com conteúdo (ex.: só 'hum' ou só 'éh'), devolva uma string vazia. Se houver qualquer informação (data, hora, nome, número), NUNCA devolva vazio.
6. PRESERVE todas as informações, a ordem das ideias, nomes próprios e termos técnicos. NÃO troque palavras sem necessidade, NÃO resuma, NÃO invente, NÃO traduza, NÃO responda.

Exemplos:
- 'que horas sao' -> 'Que horas são?'
- 'que legal ganhamos' -> 'Que legal! Ganhamos.'
- 'quando eu cheguei la ele saiu' -> 'Quando eu cheguei lá, ele saiu.'

Responda somente com o texto corrigido.

Texto: {text}"""

# Se existir config local, usa o prompt REAL configurado no app.
settings_path = os.path.join(os.environ.get("APPDATA", ""), "com.pais.handy", "settings_store.json")
if os.path.isfile(settings_path):
    try:
        s = json.load(io.open(settings_path, encoding="utf-8"))["settings"]
        pid = s.get("post_process_selected_prompt_id")
        for item in s.get("post_process_prompts", []):
            if item.get("id") == pid and "${output}" in item.get("prompt", ""):
                PROMPT = item["prompt"]
        if s.get("post_process_models", {}).get("groq") and GROQ_KEY:
            MODEL = s["post_process_models"]["groq"]
    except Exception:
        pass


def normalizar(s):
    return re.sub(r"\s+", " ", s).strip()


def revisar(text):
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": PROMPT.replace("${output}", text).format(text=text)}],
        "max_tokens": 512,
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "User-Agent": UA},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        body = json.loads(r.read().decode("utf-8"))
    return (body["choices"][0]["message"].get("content") or "").strip()


def main():
    if not KEY:
        print("ERRO: GROQ_API_KEY ou NVIDIA_API_KEY não encontrada (.env ou variável de ambiente).")
        return
    cases = json.load(io.open(os.path.join(BASE, "tools", "golden", "golden_ptbr.json"), encoding="utf-8"))
    ok = 0
    tempos = []
    print(f"PROVEDOR: {PROVIDER} | MODELO: {MODEL}")
    for c in cases:
        t0 = time.time()
        try:
            saida = revisar(c["input"])
        except Exception as e:
            saida = f"[ERRO {type(e).__name__}]"
        dt = time.time() - t0
        tempos.append(dt)
        esperado = normalizar(c["expected"])
        obtido = normalizar(saida)
        acertou = obtido == esperado
        if acertou:
            ok += 1
        print(f"{'OK ' if acertou else 'FALHA'} #{c['id']:02d} {c['tests']} ({dt:.1f}s)")
        if not acertou:
            print(f"   esperado: {esperado!r}")
            print(f"   obtido  : {obtido!r}")
    print("-" * 60)
    print(f"RESULTADO: {ok}/{len(cases)} acertos | tempo médio {sum(tempos)/len(tempos):.1f}s")
    print("Meta: >= 8/10, <= 8s por frase.")


if __name__ == "__main__":
    main()
