r"""
==============================================================
 PAINEL DE TESTE - MICROFONE + TRANSCRICAO PT-BR (Riva/Parakeet)
==============================================================
Janela com botao PLAY. Clique, fale em portugues, clique PARAR.
O audio e transcrito via NVIDIA Riva (rapido, preciso, PT-BR).
Nao precisa do Handy nem de build.

ABRIR: duplo clique em TESTE_MIC.bat
==============================================================
"""
import io
import struct
import threading
import tkinter as tk
from tkinter import scrolledtext

import sounddevice as sd
import numpy as np

from riva_asr import transcrever_wav

SAMPLE_RATE = 16000


def gravar_wav(samples):
    buf = io.BytesIO()
    n = len(samples)
    buf.write(b"RIFF" + struct.pack("<I", 36 + n * 2) + b"WAVE")
    buf.write(b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16))
    buf.write(b"data" + struct.pack("<I", n * 2))
    for s in samples:
        s = max(-1.0, min(1.0, float(s)))
        buf.write(struct.pack("<h", int(s * 32767)))
    return buf.getvalue()


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("Teste PT-BR - microfone (Riva/Parakeet)")
        self.root.geometry("660x500")
        self.root.resizable(False, False)
        self.gravando = False
        self.frames = []
        self.stream = None

        tk.Label(root, text="Teste de transcricao PT-BR (NVIDIA Riva)", font=("Segoe UI", 14, "bold")).pack(pady=(14, 4))
        tk.Label(root, text="Clique em PLAY, fale em portugues, clique em PARAR.", font=("Segoe UI", 10)).pack()

        self.btn = tk.Button(
            root, text="▶  PLAY (comecar a falar)", font=("Segoe UI", 12, "bold"),
            bg="#2563eb", fg="white", width=30, height=2, command=self.toggle
        )
        self.btn.pack(pady=14)

        self.status = tk.Label(root, text="Pronto. Clique em PLAY.", font=("Segoe UI", 10), fg="#555")
        self.status.pack()

        tk.Label(root, text="Transcricao (PT-BR):", font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=16, pady=(12, 2))
        self.out = scrolledtext.ScrolledText(root, wrap=tk.WORD, font=("Segoe UI", 11), height=12)
        self.out.pack(fill="both", expand=True, padx=16, pady=(0, 16))
        self.out.configure(state="disabled")

    def log(self, msg):
        self.status.config(text=msg)
        self.root.update_idletasks()

    def saida(self, texto):
        self.out.configure(state="normal")
        self.out.delete("1.0", tk.END)
        self.out.insert(tk.END, texto or "(vazio)")
        self.out.configure(state="disabled")

    def toggle(self):
        self.parar() if self.gravando else self.iniciar()

    def iniciar(self):
        self.frames = []
        self.gravando = True
        self.btn.config(text="■  PARAR (finalizar fala)", bg="#dc2626")
        self.log("GRAVANDO... fale agora em portugues")

        def callback(indata, frames, time, status):
            if self.gravando:
                self.frames.extend(indata[:, 0].copy())

        try:
            self.stream = sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="float32", callback=callback)
            self.stream.start()
        except Exception as e:
            self.gravando = False
            self.btn.config(text="▶  PLAY (comecar a falar)", bg="#2563eb")
            self.log("ERRO ao abrir microfone")
            self.saida(f"{type(e).__name__}: {e}")

    def parar(self):
        self.gravando = False
        self.btn.config(text="▶  PLAY (comecar a falar)", bg="#2563eb")
        try:
            self.stream.stop()
            self.stream.close()
        except Exception:
            pass

        samples = np.array(self.frames, dtype="float32")
        duracao = len(samples) / SAMPLE_RATE
        if duracao < 0.3:
            self.log("Audio muito curto. Tente falar mais.")
            self.saida("Nenhum audio capturado (menos de 0.3s).")
            return

        self.log(f"Audio ({duracao:.1f}s). Transcrevendo em PT-BR...")
        self.saida("Aguarde...")
        wav = gravar_wav(samples)

        def worker():
            try:
                texto = transcrever_wav(wav)
                self.root.after(0, lambda: (self.saida(texto), self.log("Concluido (PT-BR).")))
            except Exception as e:
                self.root.after(0, lambda: (self.saida(f"ERRO: {type(e).__name__}: {e}"), self.log("Falhou.")))

        threading.Thread(target=worker, daemon=True).start()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
