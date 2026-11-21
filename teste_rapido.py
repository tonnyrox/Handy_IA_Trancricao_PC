r"""
==============================================================
 TESTE RAPIDO DE TRANSCRICAO PT-BR (NVIDIA Riva / Parakeet)
==============================================================
Transcreve a gravacao .wav mais recente usando o Parakeet via
gRPC - rapido, preciso e SEMPRE em português do Brasil.

COMO RODAR (duplo clique em TESTE.bat, ou PowerShell):
  & "<venv>\Scripts\python.exe" "teste_rapido.py"

Outras opcoes:
  ... "teste_rapido.py" arquivo CAMINHO   -> transcreve um .wav especifico
==============================================================
"""
import os
import sys
from riva_asr import transcrever_wav


def ultima_gravacao():
    pasta = os.path.join(os.environ["APPDATA"], "com.pais.handy", "recordings")
    if not os.path.isdir(pasta):
        raise SystemExit("Pasta de gravacoes nao encontrada.")
    wavs = [os.path.join(pasta, f) for f in os.listdir(pasta) if f.endswith(".wav")]
    if not wavs:
        raise SystemExit("Nenhum .wav. Faca uma gravacao (Caps Lock) no app primeiro.")
    return max(wavs, key=os.path.getmtime)


def main():
    args = sys.argv[1:]
    if args and args[0].lower() == "arquivo" and len(args) > 1:
        wav = args[1]
    else:
        wav = ultima_gravacao()
    print("Audio:", os.path.basename(wav))
    print("-" * 56)
    try:
        with open(wav, "rb") as f:
            texto = transcrever_wav(f.read())
        print("TRANSCRICAO (PT-BR):")
        print(texto)
        print("-" * 56)
        print("OK: transcricao em portugues do Brasil.")
    except Exception as e:
        print("ERRO:", type(e).__name__, e)


if __name__ == "__main__":
    main()
