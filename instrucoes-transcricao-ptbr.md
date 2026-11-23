# Instruções: transcrição de voz com correção em português do Brasil (PT-BR)

> Documento para passar a uma IA (assistente de código) que vai montar o sistema.
> Pesquisa feita em 23/11/2026. Itens marcados com **[CONFIRMAR]** não foram verificados e devem ser checados no painel do provedor.

## 1. Objetivo

O usuário fala muito (cerca de 8 horas por dia) e prefere falar a digitar. Ele quer:

- Transcrever a fala em texto, **rápido**, em português do Brasil.
- Texto com **pontuação (principalmente vírgulas), acentuação, concordância e coerência** corretas.
- Uso **gratuito** via **API** (o computador dele não aguarda rodar modelos locais com rapidez).

## 2. Problema encontrado

- Modelos de transcrição (ex.: NVIDIA Parakeet) acertam as palavras, mas **erram vírgulas e coerência**.
- Mesmo o modelo de pontuação PT-BR da NVIDIA só trata vírgula, ponto e interrogação.
- Solução: **duas etapas**. (1) transcrever; (2) passar o texto por um **LLM de revisão** com prompt em PT-BR.

## 3. Arquitetura recomendada

```
Áudio -> [Groq: whisper-large-v3-turbo] -> texto cru
      -> [Groq: openai/gpt-oss-20b ou 120b, prompt de revisão] -> texto final
      -> (se a Groq der erro 429 de limite) -> [Google Gemini Flash, reserva]
```

Alternativa em um passo só: enviar o áudio ao Gemini pedindo "transcreva e corrija em PT-BR". Atenção: na camada gratuita, o Google pode usar o conteúdo para melhorar seus produtos. Evitar dados sensíveis.

## 4. Como obter a chave da Groq (com "q", groq.com)

1. Acessar console.groq.com e criar conta.
2. Verificar o telefone. Não pede cartão.
3. Gerar a chave em console.groq.com/keys.
4. Guardar em variável de ambiente `GROQ_API_KEY`. Nunca colocar a chave dentro do código.

- Endereço da API (compatível com OpenAI): `https://api.groq.com/openai/v1`
- Transcrição: modelo `whisper-large-v3-turbo`
- Revisão: modelo `openai/gpt-oss-20b` (mais rápido) ou `openai/gpt-oss-120b` (mais capaz)

## 5. Limites do plano gratuito da Groq

Fonte: console.groq.com/docs/rate-limits. Valores exatos da conta aparecem em console.groq.com/settings/limits **[CONFIRMAR]**.

| Modelo | Pedidos/min | Pedidos/dia | Tokens/min | Tokens/dia | Áudio/hora | Áudio/dia |
|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | 20 | 2.000 | - | - | 7.200 s | 28.800 s |
| whisper-large-v3 | 20 | 2.000 | - | - | 7.200 s | 28.800 s |
| openai/gpt-oss-20b | 30 | 1.000 | 8.000 | 200.000 | - | - |
| openai/gpt-oss-120b | 30 | 1.000 | 8.000 | 200.000 | - | - |

Consequências práticas:

- **8.000 tokens por minuto** é o limite mais apertado. Enviar textos em **blocos pequenos** (1 a 2 parágrafos, cerca de 3.000 caracteres) e esperar entre pedidos.
- **200 mil tokens por dia** pode não bastar para 8 horas de fala. Ao receber erro 429, trocar para a reserva (Gemini).
- Limite de áudio: 8 horas por dia. Arquivos de até **25 MB** no plano gratuito.
- Áudios com menos de 30 segundos são preenchidos com silêncio. Preferir trechos mais longos.
- Os limites valem por organização, não por chave. Criar várias chaves não aumenta o limite.

## 6. Prompt de revisão (usar como mensagem do sistema/usuário)

```
Você é um revisor de português do Brasil. Receba uma transcrição de fala e devolva o texto corrigido.

Regras:
- Corrija pontuação (principalmente vírgulas), acentuação, concordância, crase e maiúsculas, seguindo a norma culta do português brasileiro.
- Remova repetições e vícios de fala ("né", "tipo", "é...") e frases quebradas, deixando o texto coerente e fluido.
- NÃO mude o sentido, NÃO adicione informações e NÃO resuma.
- Mantenha nomes próprios, termos técnicos e números como estão.
- Responda somente com o texto corrigido, sem comentários.

Texto:
{texto}
```

Dicas: usar `temperature=0.2`. Se ainda errar vírgulas, acrescentar 2 ou 3 exemplos "antes e depois" do próprio usuário no prompt.

## 7. Script de exemplo (Python)

Instalar: `pip install openai`

```python
import os
import time
from openai import OpenAI

PROMPT = """Você é um revisor de português do Brasil. Receba uma transcrição de fala e devolva o texto corrigido.

Regras:
- Corrija pontuação (principalmente vírgulas), acentuação, concordância, crase e maiúsculas, seguindo a norma culta do português brasileiro.
- Remova repetições e vícios de fala ("né", "tipo", "é...") e frases quebradas, deixando o texto coerente e fluido.
- NÃO mude o sentido, NÃO adicione informações e NÃO resuma.
- Mantenha nomes próprios, termos técnicos e números como estão.
- Responda somente com o texto corrigido, sem comentários.

Texto:
{texto}"""

groq = OpenAI(
    base_url="https://api.groq.com/openai/v1",
    api_key=os.environ["GROQ_API_KEY"],
)

# Reserva (Gemini, endpoint compatível com OpenAI). [CONFIRMAR] o endereço e o nome do modelo no painel do Google AI Studio.
gemini = None
if os.environ.get("GEMINI_API_KEY"):
    gemini = OpenAI(
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
        api_key=os.environ["GEMINI_API_KEY"],
    )
GEMINI_MODEL = "gemini-flash-latest"  # [CONFIRMAR] id exato do modelo Flash gratuito

GROQ_MODEL = "openai/gpt-oss-20b"
MAX_CHARS = 3000  # mantém cada pedido abaixo do limite de 8.000 tokens por minuto


def transcrever(caminho_audio: str) -> str:
    """Envia o áudio (até 25 MB) para o Whisper turbo da Groq."""
    with open(caminho_audio, "rb") as f:
        r = groq.audio.transcriptions.create(
            model="whisper-large-v3-turbo",
            file=f,
            language="pt",
        )
    return r.text


def dividir(texto: str, max_chars: int = MAX_CHARS):
    """Divide o texto em blocos, sem cortar no meio das frases."""
    blocos, atual = [], ""
    for frase in texto.replace("\n", " ").split(". "):
        if len(atual) + len(frase) > max_chars and atual:
            blocos.append(atual.strip())
            atual = ""
        atual += frase + ". "
    if atual.strip():
        blocos.append(atual.strip())
    return blocos


def revisar_bloco(bloco: str) -> str:
    mensagem = [{"role": "user", "content": PROMPT.replace("{texto}", bloco)}]
    try:
        r = groq.chat.completions.create(
            model=GROQ_MODEL, messages=mensagem, temperature=0.2
        )
        return r.choices[0].message.content.strip()
    except Exception as e:
        # Erro 429 = limite atingido. Troca para a reserva, se existir.
        if "429" in str(e) and gemini is not None:
            r = gemini.chat.completions.create(
                model=GEMINI_MODEL, messages=mensagem, temperature=0.2
            )
            return r.choices[0].message.content.strip()
        raise


def revisar(texto: str) -> str:
    partes = []
    for bloco in dividir(texto):
        partes.append(revisar_bloco(bloco))
        time.sleep(8)  # folga para não estourar os 8.000 tokens por minuto
    return "\n\n".join(partes)


if __name__ == "__main__":
    import sys

    audio = sys.argv[1]
    cru = transcrever(audio)
    print("--- TEXTO CRU ---\n", cru)
    final = revisar(cru)
    print("\n--- TEXTO REVISADO ---\n", final)
```

Uso: `python transcrever.py meu_audio.mp3`

Para áudios acima de 25 MB: reduzir o arquivo (por exemplo, converter para mono, 16 kHz) ou dividir em partes antes de enviar.

## 8. Opções avaliadas e descartadas (ou secundárias)

- **NVIDIA build.nvidia.com (Parakeet 1.1B RNNT Multilingual):** lista Português (Brasil) e tem API gratuita para desenvolvimento, mas com limitação por tráfego e sem garantia de velocidade. Pontuação fraca em vírgulas. Serve como teste. A página tem gravador de microfone.
- **Modelos locais (Parakeet, Canary, Nemotron, Whisper):** exigem GPU potente; o usuário disse que o computador é lento.
- **Mistral:** fontes se contradizem sobre ainda existir API gratuita. O plano antigo de 1 bilhão de tokens por mês não existe mais. **[CONFIRMAR]** no painel (admin.mistral.ai).
- **OpenAI / ChatGPT:** API paga por uso. A assinatura do ChatGPT não inclui API. O gpt-5-mini custa US$ 0,25 por milhão de tokens de entrada e US$ 2,00 de saída. Estimativa (sem fonte): cerca de US$ 5 por mês para 8 horas de fala por dia. Boa opção paga se os limites gratuitos não bastarem.
- **OpenRouter (modelos :free):** só 50 pedidos por dia. Insuficiente.

## 9. Pontos a verificar antes de usar

- Limites reais da conta Groq em console.groq.com/settings/limits.
- Endereço e id do modelo do Gemini (reserva).
- Se o plano gratuito da Groq continua sem cartão e com os mesmos limites (podem mudar sem aviso).
- Qualidade da revisão em textos reais do usuário: testar `gpt-oss-20b` contra `gpt-oss-120b`.

## 10. Fontes

- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/speech-to-text
- https://dev.to/build996/free-whisper-api-groq-deepgram-assemblyai-compared-562m
- https://plugsky.com/free-llm-api
- https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr
- https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b
- https://www.aifreeapi.com/en/posts/mistral-api-free-tier
- https://developers.openai.com/api/docs/pricing
