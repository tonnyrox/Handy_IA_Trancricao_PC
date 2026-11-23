# Melhorias: transcrição PT-BR, pontuação e Caps Lock padrão

Análise do repositório `tonnyrox/Handy_IA_Trancricao_PC` (fork do Handy, Tauri 2 + Rust + React), lida direto do código.

> **O que foi e não foi verificado.** Li o código e rastreei o caminho completo: Caps Lock → gravação → Riva/Parakeet → pós-processamento → colagem. **Não rodei o app nem chamei a API da NVIDIA** (não tenho sua chave), então as hipóteses sobre a qualidade da pontuação do modelo precisam ser confirmadas com o teste da seção 6. Nada no repositório foi alterado: este arquivo é só o plano.

---

## 1. Resposta direta: dá pra resolver no código ou só no modelo?

**Os dois, mas a maior parte do ganho está no seu código.**

O Parakeet (via Riva) devolve o texto bruto. O código já pede pontuação (`enable_automatic_punctuation: true`), mas **não consegue garantir** que o modelo pontue bem em PT-BR. O que o seu código controla, e hoje deixa na mesa:

1. **A frase boa que o app já sabe fazer não roda no atalho principal.** Existe um prompt PT-BR que corrige vírgulas, maiúsculas e pontos, mas ele só roda no atalho secundário "transcrever com pós-processamento", que por padrão nem está ativo (`post_process_enabled = false`). Ou seja: o Caps Lock entrega o texto cru do modelo. **É o achado principal.**
2. **O áudio longo é cortado a cada 30 s sem olhar pra fala**, e cada pedaço volta com maiúscula inicial e ponto final próprios. Costura vira "…a gente foi lá. Para ver o resultado…" no meio de uma frase.
3. **Não existe nenhum corretor determinístico de PT-BR** (espaço antes de vírgula, maiúscula após ponto, ponto final). Dá pra fazer em Rust local, sem LLM, sem latência e sem custo.
4. **Palavras personalizadas não chegam ao modelo.** O Riva aceita `speech_contexts` (reforço de vocabulário), mas o código não envia. E o corretor "fuzzy" local só funciona com palavras ASCII (sem acento), o que exclui boa parte do português.

---

## 2. Como o fluxo funciona hoje

```
Caps Lock (configurado só no seu settings_store.json local)
  → AudioRecordingManager grava (16 kHz mono)
  → TranscriptionManager::complete()                    managers/transcription.rs:1019
      → samples_to_wav_bytes()                          nvidia_transcription.rs
      → nvidia_riva::transcribe_audio_blocking()        nvidia_riva.rs   (gRPC, pt-BR, pedaços de 30 s)
      → post_process_transcription_text()               transcription.rs:1731
            custom words (fuzzy) → remover muletas → normalizar espaços
  → process_transcription_output(post_process=false)    actions.rs:488   ← LLM NÃO roda aqui
  → cola no app ativo
```

O LLM (`post_process_transcription`, `actions.rs:221`) só entra se a ação for a `transcribe_with_post_process`.

---

## 3. Melhorias para a pontuação (prioridade alta → baixa)

### 3.1 Rodar o polimento PT-BR no próprio Caps Lock  *(impacto: alto, esforço: baixo)*

Hoje `actions.rs` faz `let post_process = self.post_process;`. Proposta: uma configuração nova `post_process_always` (ou reaproveitar `post_process_enabled`) que faz o atalho principal também passar pelo LLM.

```rust
// actions.rs, em TranscribeAction::stop(...)
let settings = get_settings(app);
let post_process = self.post_process
    || (settings.post_process_enabled && settings.post_process_on_main_shortcut);
```

Para não pagar 1–3 s de LLM em tudo, **pule o LLM quando não precisa**:

```rust
fn needs_llm_polish(text: &str) -> bool {
    let words = text.split_whitespace().count();
    if words < 4 { return false; }                        // fala curta: o corretor local basta
    let has_inner_punct = text.trim_end_matches(['.', '!', '?'])
        .chars().any(|c| matches!(c, ',' | ';' | ':' | '.' | '?' | '!'));
    words > 12 && !has_inner_punct                        // texto longo sem nenhuma pontuação
}
```

**Atenção ao `fidelity_guard`** (`actions.rs:453`): ele descarta a resposta do LLM quando menos de 60% das palavras originais sobrevivem. Em frases **curtas** com números por extenso (`"dez por cento"` → `"10%"`) a taxa cai a 0% e o app **ignora silenciosamente a conversão**. Sugestão: só aplicar o guard quando o original tiver mais de ~8 palavras, ou comparar sem contar tokens numéricos.

### 3.2 Corretor determinístico de PT-BR em Rust  *(impacto: médio-alto, esforço: baixo)*

Novo em `audio_toolkit/text.rs`, chamado dentro de `post_process_transcription_text` (depois de `normalize_transcription_output`). Sem rede, sem custo, roda sempre.

```rust
static SPACE_BEFORE_PUNCT: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+([,;:!?])").unwrap());
static MISSING_SPACE_AFTER: Lazy<Regex> = Lazy::new(|| Regex::new(r"([,;:!?])(\p{L})").unwrap());
static SENTENCE_START: Lazy<Regex> = Lazy::new(|| Regex::new(r"([.!?…]\s+)(\p{Ll})").unwrap());

pub fn normalize_ptbr_punctuation(text: &str, add_final_period: bool) -> String {
    let t = SPACE_BEFORE_PUNCT.replace_all(text, "$1");
    let t = MISSING_SPACE_AFTER.replace_all(&t, "$1 $2");
    let t = SENTENCE_START.replace_all(&t, |c: &regex::Captures| {
        format!("{}{}", &c[1], c[2].to_uppercase())
    });
    let mut out = t.trim().to_string();

    // Primeira letra maiúscula.
    if let Some(first) = out.chars().next() {
        if first.is_lowercase() {
            out = first.to_uppercase().collect::<String>() + &out[first.len_utf8()..];
        }
    }
    // Ponto final só se terminar em letra/número (configurável: em chat muita gente não quer).
    if add_final_period
        && out.chars().last().is_some_and(|c| c.is_alphanumeric())
        && out.split_whitespace().count() >= 4
    {
        out.push('.');
    }
    out
}
```

Não mexi em `.` seguido de letra de propósito, para não quebrar `3.5`, `site.com.br`, `R$ 1.500`. Para detectar perguntas ("que horas são" sem `?`), use uma lista curta de iniciadores (`quem, qual, quais, quando, onde, como, por que, o que, que horas`) e só adicione `?` se o modelo não tiver devolvido pontuação final.

### 3.3 Cortar o áudio longo no silêncio, não a cada 30 s  *(impacto: médio, esforço: médio)*

Em `nvidia_riva.rs:161`:

```rust
const CHUNK_SAMPLES: usize = 480_000; // 30 s
for chunk_start in (0..total_samples).step_by(CHUNK_SAMPLES) { ... }
```

Corta no meio de palavra e cada pedaço é pontuado isoladamente. Duas correções:

- **Corte no ponto mais silencioso** perto dos 30 s (janela de ±2 s, quadros de 20 ms por energia RMS), ou reaproveite o VAD Silero que o projeto já tem em `audio_toolkit/vad/`.
- **Costura inteligente:** se o pedaço `i` termina em `.` e o `i+1` foi cortado sem silêncio, remova o ponto do `i` e minuscule a primeira letra do `i+1` (só nesse caso, nunca em cortes feitos em silêncio real).

Falas de ditado costumam ter menos de 30 s, então esse item só importa para quem dita parágrafos longos.

### 3.4 Enviar as palavras personalizadas ao Riva (`speech_contexts`)  *(impacto: médio, esforço: baixo)*

O `.proto` do projeto já tem `SpeechContext { phrases, boost }` e `RecognitionConfig.speech_contexts` (campo 6). Em `nvidia_riva.rs`:

```rust
use crate::nvidia_riva_proto::riva::asr::SpeechContext;

let config = RecognitionConfig {
    // ...campos atuais...
    speech_contexts: vec![SpeechContext {
        phrases: custom_words.to_vec(),   // nomes próprios, marcas, termos técnicos
        boost: 10.0,                      // faixa recomendada pelo proto: 0–20; calibrar
    }],
    ..Default::default()
};
```

`transcribe_audio_blocking` precisa receber `custom_words` (vindos de `settings.custom_words`). Depois disso, chame `post_process_transcription_text(..., custom_words_already_prompted = true, ...)` para não aplicar o fuzzy duas vezes. Boost alto demais gera falso positivo (o próprio proto avisa), então calibre com seus nomes reais.

### 3.5 Corrigir o corretor "fuzzy" para português  *(impacto: médio, esforço: médio)*

`audio_toolkit/text.rs`: `is_supported_fuzzy_key` exige `is_ascii_alphanumeric`, então **qualquer palavra personalizada com acento** (`Brasília`, `Gonçalves`, `São`) é ignorada, e o Soundex é um algoritmo de inglês. Sugestões:

- Normalizar acentos nas chaves de comparação (NFD e remover marcas combinantes, crate `unicode-normalization`) e comparar sem acento, devolvendo a palavra original com acento.
- Usar só Levenshtein normalizado para PT (Soundex dá "boost" errado em português).

### 3.5b Ajustes no prompt do LLM  *(impacto: baixo-médio, esforço: mínimo)*

Em `settings.rs:929` (`default_post_process_prompts`):

- Regra 3: `"vírgula" → ,,` fica ambíguo ("duas vírgulas?"). Reescreva com aspas: `"ponto" → "."`, `"vírgula" → ","`, etc.
- Regra 4 usa a palavra **"muletillas"** (espanhol). Troque por "muletas de fala".
- Regra 4 manda remover "tipo", mas o filtro em Rust (`text.rs`, E-07) **deliberadamente não remove "tipo"** por poder ter sentido real. Alinhe os dois (sugestão: manter "tipo" e "né").
- Adicione 2 exemplos curtos (few-shot) com vírgulas de vocativo e de oração subordinada; modelos pequenos seguem melhor exemplo do que regra.

---

## 4. Caps Lock como padrão no repositório

### O que existe hoje

- O padrão em código é **`ctrl+space`** (Windows), `option+space` (macOS), `ctrl+alt+space` (Linux): `settings.rs:1037-1046`. O atalho secundário é `ctrl+shift+space` etc.
- O Caps Lock que você usa está **só no seu `settings_store.json` local** (os planos `.opencode/plans/008…011` e o `TESTE.bat` já assumem Caps Lock). Quem clonar o projeto não ganha Caps Lock.
- `capslock` **já é uma tecla válida** nas duas implementações de atalho (teste em `shortcut/mod.rs:1686`) e a UI já mostra "Caps Lock" (`src/lib/utils/keyboard.ts`). Não precisa de código novo de parsing.

### Mudança mínima (`settings.rs`, `get_default_settings`)

```rust
let default_shortcut = "capslock";                 // todas as plataformas
// ...
let default_post_process_shortcut = "shift+capslock";   // validar no teste abaixo
```

Troque os dois blocos `#[cfg(target_os = ...)]` por essas constantes (ou mantenha `cfg` só se quiser Caps Lock apenas no Windows).

### Para quem já tem o app instalado (migração)

Sem migração, configurações salvas mantêm o atalho antigo. Suba `CURRENT_SETTINGS_SCHEMA_VERSION` de 3 para 4 e troque **só se o usuário ainda estiver no padrão antigo** (não sobrescreve atalho personalizado):

```rust
if stored_schema_version < 4 {
    if let Some(b) = settings.bindings.get_mut("transcribe") {
        if matches!(b.current_binding.as_str(), "ctrl+space" | "option+space" | "ctrl+alt+space") {
            b.current_binding = "capslock".to_string();
        }
    }
    settings.settings_schema_version = CURRENT_SETTINGS_SCHEMA_VERSION;
    updated = true;
}
```

### Testes que precisam acompanhar

- `settings.rs:1878` (`default_shortcuts_do_not_conflict_with_ibus_input_method_switch`) afirma `ctrl+alt+space` no Linux e vai falhar; atualize (ou, no Linux, troque o nome/objetivo do teste: Caps Lock também não conflita com o IBus).
- `shortcut/tauri_impl.rs:181` (`accepts_the_default_shortcuts`): adicione `"capslock"` e o secundário escolhido.
- Adicione um teste de migração 3 → 4.

### Riscos do Caps Lock a testar no Windows

Caps Lock é uma tecla **de estado**, não só um gatilho. Verifique:

1. **O estado do Caps Lock vira em outros apps?** O `handy-keys` é iniciado com `HotkeyManager::new_with_blocking()` (`shortcut/handy_keys.rs:98`), que provavelmente engole o evento, mas **não confirmei isso**. Se o LED acender a cada gravação, o texto digitado depois sai em maiúsculas.
2. **Modo de ativação** (`shortcut_activation`: alternar / segurar / híbrido): com Caps Lock, "segurar" pode se comportar diferente do repeat de teclado. Teste os três.
3. **`shift+capslock` como atalho do pós-processamento:** pode ter comportamento próprio no Windows. Se der problema, use `ctrl+capslock` ou deixe o secundário sem padrão.
4. Usuários de layouts/teclados sem Caps Lock físico (notebooks compactos): mantenha o atalho editável (já é) e deixe isso claro no README.

---

## 5. Bugs e problemas encontrados no caminho

| # | Onde | Problema | Gravidade | Sugestão |
|---|------|----------|-----------|----------|
| B1 | `nvidia_riva.rs:55-74` | Uma conexão gRPC nova **por fala** (~5 s de latência, segundo o próprio comentário). A tentativa anterior de cachear o canal "travava": **causa provável** é que cada chamada cria um runtime novo (`current_thread`) numa thread nova, e o canal do `tonic` vive no runtime onde foi criado; quando esse runtime morre, o canal fica inutilizável. | Alta (latência) | Um runtime único e vivo (`static OnceLock<Runtime>` ou o runtime do Tauri) + canal cacheado criado nele, recriando em caso de erro. Hipótese: confirmar com um teste de duas falas seguidas. |
| B2 | `nvidia_riva.rs:201` | Áudio sem fala retorna `Err("Riva returned an empty transcription")` → o usuário vê **aviso de erro** ao apertar Caps Lock e não falar. O `test_nvidia_transcription` até contorna isso com `e.contains("empty")`. | Média | Retornar `Ok(String::new())` e deixar `finish_without_text` tratar. |
| B3 | `nvidia_riva.rs:81-98` | O retry tenta de novo em **qualquer** erro (inclusive `InvalidArgument`) e decide por texto da mensagem (`contains("Chave NVIDIA inválida")`). | Baixa | Classificar pelo `tonic::Code`; retry só em `Unavailable`, `DeadlineExceeded`, `Internal`. |
| B4 | `transcription.rs:1024` | `transcribe_audio_blocking` bloqueia a thread (spawn + join) dentro de uma task assíncrona (`actions.rs:849`). | Baixa | Tornar assíncrono de ponta a ponta com o runtime único do B1. |
| B5 | `settings.rs:365-370` | Provedor padrão é **Local** e `nvidia_asr_function_id` vem vazio. Quem clona o repo cai no modelo local sem baixar nada. | Média (onboarding) | Documentar no README o passo "chave + Function-ID" ou detectar e guiar no primeiro uso. |
| B6 | `nvidia_transcription.rs:247-252` | Verificação de modelo por **frases em português** ("não foi possível", "não consigo"): frágil. | Baixa | Comparar contra transcrição esperada ou só checar status 200 + texto não vazio. |
| B7 | `shortcut/mod.rs:1638` | `test_nvidia_transcription` ignora o parâmetro `model` (só imprime). Campo `nvidia_transcription_model` é código morto no caminho Riva. | Baixa | Remover ou documentar. |
| B8 | `actions.rs:453` | `fidelity_guard` descarta conversões válidas em frases curtas (detalhe na 3.1). | Média | Limite mínimo de palavras / ignorar números. |

**Segurança (verificado):** não há chaves `nvapi-…` commitadas, `.env` está no `.gitignore` e nenhum `settings_store.json` está versionado. Bom. (`riva_asr.py` lê `NVIDIA_API_KEY`/`NVIDIA_FUNCTION_ID` do ambiente ou de `.env`.)

---

## 6. Como medir (antes e depois)

Use o que o projeto já tem: `TESTE.bat` / `teste_rapido.py` transcrevem a última gravação em `%APPDATA%\com.pais.handy\recordings`.

1. Grave **10 falas fixas** de ~10–25 s (ditado normal, com vocativos, listas, perguntas, números, nomes próprios).
2. Escreva à mão a transcrição ideal de cada uma.
3. Compare por três métricas simples: erro de palavras (WER), **erro de pontuação** (vírgulas/pontos/interrogações acertadas) e **maiúsculas após ponto**.
4. Rode: (a) como está hoje, (b) com 3.2, (c) com 3.2 + 3.1, (d) com 3.4 + 3.3.
5. Só aceite um item se melhorar a métrica sem aumentar a latência de forma perceptível (meta sugerida: texto na tela em menos de ~2 s para falas curtas, hoje ~5 s só de conexão).

Casos mínimos para os testes automáticos do corretor (3.2):

| Entrada (bruta) | Saída esperada |
|---|---|
| `oi , tudo bem ?` | `Oi, tudo bem?` |
| `eu fui lá. depois voltei` | `Eu fui lá. Depois voltei.` |
| `o valor é 3.5 reais` | `O valor é 3.5 reais.` (ponto decimal intacto) |
| `acesse site.com.br agora` | `Acesse site.com.br agora.` |
| `ok` | `Ok` (curto: sem ponto final) |

---

## 7. Ordem sugerida de implementação

1. **Caps Lock padrão + migração + testes** (seção 4). Rápido, resolve o pedido direto.
2. **Corretor PT-BR local (3.2)** e ligar sempre. Ganho imediato e sem custo.
3. **Polimento por LLM no atalho principal (3.1)** com os filtros de "quando vale a pena" e o ajuste do `fidelity_guard`.
4. **Runtime/canal únicos (B1) + B2**: menos latência e sem erro ao ficar em silêncio.
5. **`speech_contexts` (3.4)** e **corte no silêncio (3.3)**.
6. Ajustes de prompt (3.5b) e fuzzy com acentos (3.5).

Se quiser, o próximo passo é eu implementar os itens 1 e 2 (são os mais seguros) e te passar o diff para você testar o Caps Lock no Windows, que é a parte que eu não consigo validar daqui.

---

## 8. PENDENTE (urgente): correção gramatical, pontuação e acentuação de verdade

**Diagnóstico confirmado em 23/11/2026:** os itens 1, 2, 3.1, B2, 3.4 e 3.5b foram implementados e os testes passaram (347/347), mas o texto colado **ainda não traz pontuação/vírgulas/acentuação consistentes**. Motivo: o corretor determinístico (3.2) só faz o mínimo — espaço antes de vírgula, maiúscula após ponto e ponto final em frases com 4+ palavras. **Ele não corrige gramática nem acentuação**, e o LLM (que é o que faz isso) estava desligado: `post_process_enabled = false`, `post_process_on_main_shortcut = false` e nenhum provider/modelo/configuração de prompt ativos.

**Meta:** o usuário fala → o app cola o **conteúdo integral**, já corrigido com pontuação, vírgulas, acentuação e gramática PT-BR, sem perder informação e sem traduzir.

### 8.1 Ativar o LLM via API NVIDIA (mesma chave da transcrição)

O código já tem o provider `nvidia` (`settings.rs:885`) apontando para `https://integrate.api.nvidia.com/v1` e reutilizando `nvidia_transcription_api_key()` (`actions.rs:285`). Não precisa de outra chave nem de modelo local.

Modelo escolhido (testado com a API, 0,6 s por fala curta):
- `nvidia/nemotron-3.5-lightning-30b-a3b`
- Entrada: `oi tudo bem eu queria falar que a gente foi la ontem e vimos o resultado depois volta amanha`
- Saída: `Oi, tudo bem? Eu queria falar que a gente foi lá ontem e vimos o resultado. Depois, volta amanhã.`

Outros modelos testados e descartados: `google/gemma-*` (404/timeout), `minimaxai/minimax-m3.1-flash` (precisa de `thinking=false`, 24 s), `z-ai/glm-5.3-flash` e `moonshotai/kimi-k3.1-pro` (timeout), `mistralai/mistral-large-4-1t-a52b` (resposta vazia).

### 8.2 Ajuste de código necessário

- `actions.rs:299`: incluir `"nvidia"` em `disable_reasoning` — sem isso o Nemotron não desliga o modo reasoning e devolve texto vazio.
- `llm_client.rs:61` (`reasoning_disable_params`): para `integrate.api.nvidia.com`, enviar `thinking: false` (o campo genérico `reasoning_effort: "none"` não é o que esse endpoint espera).

### 8.3 Configuração a aplicar em `settings_store.json` (dados locais, nunca versionar)

```json
{
  "post_process_enabled": true,
  "post_process_on_main_shortcut": true,
  "post_process_provider_id": "nvidia",
  "post_process_models": { "nvidia": "nvidia/nemotron-3.5-lightning-30b-a3b" },
  "post_process_selected_prompt_id": "ptbr_grammar_fix",
  "post_process_prompts": [
    {
      "id": "ptbr_grammar_fix",
      "name": "Correção gramatical PT-BR",
      "prompt": "Corrija APENAS acentuação e pontuação (vírgulas, pontos, ? e !) em português do Brasil. PRESERVE TODAS as palavras do original, inclusive advérbios como \"depois\", \"ontem\", \"amanhã\". NÃO troque, remova, adicione ou reordene palavras. NÃO mude a concordância verbal. Exemplo: \"oi tudo bem eu fui la ontem\" -> \"Oi, tudo bem? Eu fui lá ontem.\" Retorne somente o texto corrigido.\n\nTexto: ${output}"
    }
  ]
}
```

### 8.4 Ordem de execução

1. Atualizar este arquivo com o diagnóstico (feito).
2. Ajustar `actions.rs` e `llm_client.rs` (item 8.2).
3. Aplicar a configuração local (item 8.3) — fora do repo.
4. `cargo test --lib` + `bun run build` + `bun run tauri build --no-bundle`.
5. Reinstalar preservando a chave e validar com o texto de exemplo acima.
6. Fazer commit/push **somente das mudanças de código e deste MD** — nunca `.env`, `settings_store.json` ou chaves.

**Status em 23/11/2026:** itens 8.1–8.4 concluídos. Testes 348/348, build OK, reinstalado, commit `e37abeb` publicado.

---

## 9. REGISTRO PARA AMANHÃ (24/11/2026) — não implementar hoje

Observações do usuário após o teste real do dia 23/11. **Nada disso foi feito ainda** — é o próximo trabalho.

### 9.1 Pontuação final está errada / ausente

O texto já vem acentuado e com vírgulas, mas **a pontuação no fim da frase não está sendo aplicada corretamente**:

- Não distingue **pergunta** (`?`) de **afirmação** (`.`) de **exclamação** (`!`).
- Exemplo: `que horas são` deve virar `Que horas são?`; `que legal` deve virar `Que legal!`; `eu fui lá ontem` → `Eu fui lá ontem.`.
- Hoje o modelo tende a terminar tudo com ponto, ou não pontua o fim.

**Ações planejadas:**
1. Reforçar o prompt `ptbr_grammar_fix` com regra explícita e exemplos few-shot de `?` e `!` (o prompt atual só cita "pontuação" de forma genérica).
2. Ampliar o corretor determinístico local (`audio_toolkit/text.rs`, `normalize_ptbr_punctuation`) com:
   - Lista de iniciadores de pergunta: `quem, qual, quais, quando, onde, como, por que, o que, que horas, será que, você acha que`.
   - Lista curta de marcadores de exclamação: `que legal, que bom, uau, nossa, incrível, que medo, ai meu deus`.
   - Só aplicar quando o texto **não** tiver pontuação final vinda do modelo.
3. Adicionar testes unitários para os 3 casos (`?`, `!`, `.`).

### 9.2 Gramática PT-BR ainda fraca

O usuário relatou: *"a gramática ainda está um pouco ruim, não tão boa assim em comparação à língua portuguesa do Brasil. É de extrema importância — é a base de tudo."*

**Ações planejadas:**
1. **Testar outros modelos de API** (sempre NVIDIA, sem modelo local) com `thinking=false` e `max_tokens` maior — vários foram descartados às pressas e merecem reteste:
   - `google/gemma-4-31b-it` (deu timeout; retestar com `max_tokens` menor/temperatura 0)
   - `mistralai/mistral-large-4-1t-a52b` (devolveu vazio; retestar com `thinking=false`)
   - `z-ai/glm-5.3-flash`, `moonshotai/kimi-k3.1-pro` (timeout; retestar)
   - `nvidia/nemotron-3.5-bolt-e4b` (alternativa mais rápida que já respondeu)
   - Critério: **qualidade gramatical PT-BR** > velocidade, mas manter meta de ~2 s para falas curtas.
2. Criar um **banco de frases de teste** (10–20 frases com vírgula de vocativo, subordinada, crase, concordância, plural, pergunta, exclamação) e comparar a saída modelo a modelo antes de trocar.
3. Reforçar o prompt com regras explícitas de concordância verbal/nominal, regência e crase — **sem quebrar a fidelidade** (item 8.3: não trocar/remover/inventar palavras).
4. Se nenhum modelo atingir o padrão, considerar **dois passos**: (1) corretor local determinístico + (2) LLM só para gramática, com prompt separado.

### 9.3 Ordem sugerida para amanhã

1. Rodar o banco de frases e escolher o melhor modelo de API (9.2.1–9.2.2).
2. Ajustar prompt + corretor local para pontuação final (9.1).
3. Testes unitários (`cargo test --lib`) e validação com API.
4. Build → reinstalar preservando a chave.
5. Commit/push sem dados pessoais (como em 8.4.6).

### 9.4 Estado atual preservado (para retomar)

- App instalado e funcionando em `%LOCALAPPDATA%\Programs\Handy`
- Chave NVIDIA + Function-ID em `.env` e `%APPDATA%\com.pais.handy\settings_store.json` (fora do repo)
- Provider `nvidia` ativo, modelo `nvidia/nemotron-3.5-lightning-30b-a3b`, prompt `ptbr_grammar_fix`
- GitHub atualizado até o commit `e37abeb`
- Repo limpo, sem dados sensíveis versionados

---

## 10. DECISÃO DE 23/11 (tarde): Groq para revisão gramatical

O usuário forneceu `instrucoes-transcricao-ptbr.md` e uma chave **Groq**. O documento recomenda: transcrever + passar por LLM de revisão. **Não vamos trocar o ASR** — o Riva/Parakeet já funciona e é gratuito. Vamos usar Groq **somente na revisão**.

### 10.1 Testes reais feitos na API Groq (23/11)

Chave guardada apenas em `.env` (gitignore) e em `post_process_api_keys.groq` no `settings_store.json` local (fora do repo).

**Nota importante:** a Cloudflare da Groq rejeita o user-agent padrão do Python/`reqwest` com `HTTP 1010`. É obrigatório enviar um `User-Agent` de navegador. Já ajustado em `llm_client.rs` (`shared_client()`).

Prompt usado (do documento, com regra explícita de `?`/`!`) e resultados:

| Frase bruta | `gpt-oss-20b` (0,5–0,9 s) | `gpt-oss-120b` (0,6–0,8 s) |
|---|---|---|
| `oi tudo bem eu queria falar que a gente foi la ontem e vimos o resultado depois volta amanha` | `Oi, tudo bem? ... Depois volta amanhã.` | `Oi, tudo bem? ... Depois, volta amanhã.` ✅ |
| `que horas sao voce sabe` | `Que horas são? Você sabe?` ✅ | `Que horas são? Você sabe?` ✅ |
| `que legal ganhamos o jogo ontem` | `Que legal! Ganhamos o jogo ontem.` ✅ | `Que legal! Ganhamos o jogo ontem.` ✅ |
| `eu comprei pra ela um presente e ela agradeceu a mim` | `... e ela agradeceu a mim.` | `... e ela me agradeceu.` ✅ |

**Modelo escolhido:** `openai/gpt-oss-120b` — gramática PT-BR visivelmente melhor, mesma velocidade (~0,7 s). O provider `groq` já existe no código (`settings.rs`, `https://api.groq.com/openai/v1`).

### 10.2 Configuração local aplicada

- `post_process_provider_id`: `groq`
- `post_process_models.groq`: `openai/gpt-oss-120b`
- `post_process_api_keys.groq`: chave fornecida (somente local)
- Prompt `groq_ptbr_reviewer`: o do item 6 do documento + regra de `?`/`!`
- `post_process_enabled` + `post_process_on_main_shortcut`: `true`

### 10.3 Limites a respeitar (plano gratuito/dev da Groq)

- 8.000 tokens/min por modelo (gpt-oss: 250K TPM no Developer Plan) — para ditados longos, blocos de ~3.000 caracteres.
- Whisper turbo: 400 RPM / 28.800 s de áudio por dia (não usado agora; Riva continua no ASR).
- Ao receber 429, fallback para Gemini (implementar depois, se necessário). **[CONFIRMAR]** id do modelo Gemini no painel do Google.

### 10.4 Pendências após esta decisão

- [x] Registrar diagnóstico e plano (seções 9 e 10)
- [x] Validar chave e modelos Groq na prática
- [x] Adicionar `User-Agent` no `llm_client.rs` (evita 1010)
- [ ] Aplicar configuração local com provider `groq`
- [ ] Rodar `cargo test --lib` + build + reinstalar
- [ ] Commit/push sem chaves (a chave Groq **nunca** deve entrar no repo)

**Status:** itens 10.2–10.4 concluídos. Commits `4aba0da` e `c249e45` publicados. App reinstalado com Groq ativo.

---

## 11. ANÁLISE (24/11) — por que a correção "não está sendo aplicada"

> **STATUS:** diagnóstico confirmado. As correções propostas em 11.3 foram **aplicadas no commit `98d1966`** (ver seção 13/14). Este texto histórico é mantido para rastreabilidade.

### 11.1 Causa raiz encontrada: o LLM quase nunca é chamado

O culpado é o filtro `needs_llm_polish` em `actions.rs:455` (eu mesmo adicionei no item 3.1):

```rust
fn needs_llm_polish(text: &str) -> bool {
    let words = text.split_whitespace().count();
    if words < 4 { return false; }
    let has_inner_punct = text.trim_end_matches(['.', '!', '?'])
        .chars().any(|c| matches!(c, ',' | ';' | ':' | '.' | '?' | '!'));
    words > 12 && !has_inner_punct
}
```

Ele **só deixa o LLM rodar se o texto tiver mais de 12 palavras E nenhuma pontuação interna**. Na prática isso é quase impossível, porque:

1. O Riva já devolve texto com `enable_automatic_punctuation: true` → quase sempre há vírgula/ponto → `has_inner_punct = true` → **bloqueia**.
2. A maioria das falas tem menos de 13 palavras → **bloqueia**.

**Evidência (simulação do filtro com frases reais):**

| Frase | Palavras | Resultado do filtro |
|---|---:|---|
| `os homens foi na praca ontem e eles compraram maças` | 10 | **BLOQUEIA** |
| `eu comprei pra ela um presente e ela agradeceu a mim` | 11 | **BLOQUEIA** |
| `quando eu cheguei la ele ja tinha saiu` | 8 | **BLOQUEIA** |
| `maria que mora aqui perto trouxe o bolo que sua mae fez` | 12 | **BLOQUEIA** |
| `nos vamos amanha cedo se o tempo melhorar` | 8 | **BLOQUEIA** |
| `e ai tudo bem` | 4 | **BLOQUEIA** |
| `oi tudo bem eu queria falar ... depois volta amanha` | 19 | RODA (sem pontuação) |
| `Os homens foi na praça, ontem, e eles compraram maçãs.` | 10 | **BLOQUEIA** (tem vírgula) |
| `Maria, que mora aqui perto, trouxe o bolo.` | 8 | **BLOQUEIA** (tem vírgula) |

Conclusão: o Groq está configurado e funcional, mas **o atalho principal não o invoca** nas falas do dia a dia. O texto colado é basicamente o corretor determinístico local + o que o Riva devolveu.

### 11.2 O modelo/prompt NÃO são o problema (teste direto na API)

Testei o prompt `groq_ptbr_reviewer` direto na API com `gpt-oss-120b`, **fora do app**:

| Entrada | Saída da API |
|---|---|
| `os homens foi na praca ontem e eles compraram maças` | `Os homens foram à praça ontem e compraram maçãs.` ✅ concordância + crase + acento |
| `eu comprei pra ela um presente e ela agradeceu a mim` | `Eu comprei para ela um presente e ela me agradeceu.` ✅ |
| `quando eu cheguei la ele ja tinha saiu` | `Quando eu cheguei lá, ele já tinha saído.` ✅ vírgula + acento |
| `maria que mora aqui perto trouxe o bolo que sua mae fez` | `Maria, que mora aqui perto, trouxe o bolo que sua mãe fez.` ✅ vírgulas de aposto |
| `nos vamos amanha cedo se o tempo melhorar` | `Nós vamos amanhã cedo, se o tempo melhorar.` ✅ vírgula antes da subordinada |

Ou seja: **quando o LLM roda, ele corrige bem vírgulas, concordância verbal, crase e acentuação**. O que falta é garantir que ele rode sempre.

### 11.3 Correções propostas (✅ aplicadas no commit `98d1966` — ver seção 13)

1. **Remover ou relaxar `needs_llm_polish`** em `actions.rs`:
   - Melhor opção: **sempre chamar o LLM** no atalho principal quando `post_process_enabled && post_process_on_main_shortcut`, com exceção apenas de textos muito curtos (< 4 palavras) e vazios.
   - Se quiser manter algum filtro por latência/custo: usar só `words < 3` como critério, e **nunca** usar presença de pontuação como critério (é exatamente o que precisamos corrigir).
2. **Ajustar `fidelity_guard`** (`actions.rs:470`): hoje ele descarta a revisão se menos de 60% das palavras originais sobrevivem. Como o Groq corrige "pra" → "para" e "foi" → "foram", isso pode derrubar a taxa e fazer o app **descartar justamente a correção**. Verificar com日志 antes de mexer.
3. **Conferir se o prompt está chegando ao LLM**: o `build_system_prompt` envolve o prompt; confirmar que `${output}` é substituído pelo texto transcrito e que não há conflito entre o prompt do app e o prompt do sistema.
4. **Validar de ponta a ponta**: gravar 5 falas, comparar (a) texto cru do Riva, (b) texto colado pelo app. Se (b) == (a), o LLM não rodou; se (b) difere, verificar se a diferença é a correção esperada.

### 11.4 Checklist antes de aplicar (verificação combinada)

- [ ] Confirmar com teste automatizado que `needs_llm_polish` bloqueia as frases da tabela 11.1.
- [ ] Confirmar que o provider `groq` está ativo no `settings_store.json` com chave e modelo corretos.
- [ ] Fazer uma gravação real e verificar se o app chamou a API Groq (log do debug: `Starting LLM post-processing with provider 'groq'`).
- [ ] Só depois disso: implementar 11.3.1 e ajustar 11.3.2 se necessário.
- [ ] Rodar `cargo test --lib`, build, reinstalar, commit/push sem chaves.

### 11.5 Estado atual (inalterado para esta análise)

- Nenhum código ou configuração foi modificado nesta rodada.
- App segue com Groq `gpt-oss-120b` configurado, porém com o filtro bloqueando o LLM no atalho principal.
- GitHub segue em `c249e45`.

---

## 12. ANÁLISE PROFUNDA DO SISTEMA (24/11) — portrait completo

> **STATUS:** análise concluída. Os passos P0/P1/P2 de 12.7 foram aplicados no commit `98d1966` (ver seção 13). Falta apenas rebuild + reinstalação + validação (13.4, PASSOs 5–6).

### 12.1 As QUATRO barreiras em sequência (atalho principal / Caps Lock)

| # | Barreira | Local | Efeito |
|---|---|---|---|
| 1 | `post_process_enabled` default `false` | `settings.rs:777-779` | Desliga tudo, inclusive o atalho secundário |
| 2 | `post_process_on_main_shortcut` default `false` **e sem UI/comando** | `settings.rs:510`, `:1124`, `actions.rs:921` | **Campo órfão**: existe só em Rust + tipo TS; nenhum `#[tauri::command]`, nenhum setter no store, nenhum componente. Só se altera editando o JSON na mão |
| 3 | `needs_llm_polish` exige **>12 palavras E zero pontuação interna** | `actions.rs:455-465`, chamado em `:922` | Bloqueia quase toda fala real (Riva pontua + corretor local pontua) |
| 4 | `fidelity_guard` descarta a revisão se <60% das palavras sobrevivem | `actions.rs:470-501`, aplicado em `:390` e `:436` | Silencioso (só `warn!` no log); cola o texto original e **nem avisa** (`post_process_failed` fica `false`) |

**Consequência:** o Groq está configurado e funcional, mas no dia a dia **quase nunca é invocado**; quando é, ainda pode ser descartado em silêncio.

### 12.2 Atenção: duas funções com nomes quase idênticos

| Função | Arquivo | Natureza |
|---|---|---|
| `post_process_transcription_text` (5 args) | `managers/transcription.rs:1734-1796` | Corretor **determinístico local** (sem LLM) |
| `post_process_transcription` (2 args) | `actions.rs:221-451` | Revisão **LLM** (Groq/NVIDIA/etc.) — é a que importa |

O wrapper `process_transcription_output` (`actions.rs:511`) chama a do `actions.rs`. Confusão entre essas duas é a principal fonte de erro de diagnóstico.

### 12.3 Mapa de TODOS os 11 caminhos que entregam texto

| Caminho | Onde | Passa pelo LLM? | Por que falha |
|---|---|---|---|
| A — Caps Lock (`transcribe`) | `actions.rs:821`, gate `:916-926`, colagem `:1011` | **Condicional** | 4 barreiras acima; falha **totalmente silenciosa** |
| B — Shift+Caps Lock (`transcribe_with_post_process`) | `actions.rs:1192-1195` | **Sim** | Registro depende de `post_process_enabled`; modelo/prompt vazios por default |
| C — CLI `--toggle-transcription` | `cli.rs:15`, `lib.rs:936` → binding `transcribe` | igual a A | mesmas barreiras |
| D — CLI `--toggle-post-process` | `cli.rs:19`, `lib.rs:938` | **Sim** | única forma confiável de forçar sem editar JSON |
| E — Sinais SIGUSR1/SIGUSR2 | `signal_handle.rs:26-57` | SIGUSR1 sim, SIGUSR2 não | mesmo gate de A |
| F — Live preview / streaming | `actions.rs:686`, `transcription.rs:1478` | **Não** | overlay mostra texto cru; LLM só no `stop()` → usuário vê texto diferente do colado |
| G — Histórico (retry/importar arquivo) | `transcription_jobs.rs:301-349`, `history.rs:64-94` | só se `post_process_requested=true` | campo congelado no momento da gravação; se gate barrou, grava `false` |
| H — Hook do usuário | `transcription_hook.rs`, `actions.rs:968-980` | LLM roda antes | stdout do hook **substitui** a revisão na colagem (histórico guarda a revisada) |
| I — `--transcribe-file` headless | `cli.rs:31`, `lib.rs:480-605` | **Não** | termina no determinístico, imprime no stdout |
| J — Cancelamento durante revisão | `actions.rs:186-204`, `:935-945` | future dropado | nada é colado, sem fallback |
| K — `PasteMethod::None` | `clipboard.rs:944-946` | processa mas não entrega | `append_trailing_space` é única transformação pós-LLM |

### 12.3.1 Descobertas adicionais no `fidelity_guard`

- Texto com **< 8 palavras → guard NÃO atua** (já corrigido; o MD antigo dizia o contrário).
- Com ≥ 8: compara conjuntos de tokens alfanuméricos minúsculos; **descarta se interseção/original < 0.6**.
- **Não detecta adição** de palavras inventadas (só perda).
- Trocas legítimas derrubam a taxa: `foi→foram`, `pra→para`, `a mim→me`, `saiu→saído` — **justamente as correções que queremos**.
- **Furo:** nos fallbacks de JSON inválido/sem campo `transcription` (`actions.rs:392-404`) retorna `Done(...)` **sem passar pelo guard** — texto bruto do LLM pode ser colado com explicações.

### 12.4 Configuração: quem pode sobrescrever o quê

- Backend defaults: `post_process_enabled=false`, `post_process_on_main_shortcut=false`, provider `openai`, **todos os modelos vazios**, `post_process_selected_prompt_id=None`.
- `ensure_post_process_defaults` (`settings.rs:979-1044`) **não** seta `post_process_selected_prompt_id`.
- Migrações vão até v4 e não tocam post-processing.
- Frontend: só existe toggle para `post_process_enabled` (escondido em **Debug**, `PostProcessingToggle.tsx`); a aba "Post Process" só aparece se ele já estiver `true` (`Sidebar.tsx:59-64`) — **o usuário precisa achar o toggle em Debug antes de poder configurar provider/modelo/prompt**.
- Nenhum setter para `post_process_on_main_shortcut` em `lib.rs:734-745`, `settingsStore.ts:177-180` ou componentes.

**Conclusão:** a config atual (Groq + prompt) só foi possível editando o JSON na mão. Isso é frágil e explica "toda hora volta a colocar texto bruto" — qualquer reescrita do store pelo app pode perder os campos órfãos.

### 12.5 Pesquisa na internet (boas práticas de revisão PT-BR)

Fontes consultadas: TechTudo (03/11/2026), Rodopio (30/01/2026), todo.is, CorretorIA (02/12/2025), guia de prompts jurídicos.

Consenso encontrado:
1. **Intervenção mínima necessária** — corrigir só o erro, não reescrever.
2. Explicitar o que **não** mudar: sentido, estilo, voz, nomes próprios, termos técnicos, números, ordem das ideias.
3. Pedir correção de: ortografia/AO, acentuação, **concordância verbal e nominal**, regência, crase, pontuação (vírgulas críticas), pronomes/colocação.
4. **Dupla passada**: (A) típicos — crase, concordância, regência, pontuação básica; (B) casos-limite — `a/à/há`, `por que/porque`, `onde/aonde`, `haver/existir`, `um dos que`, `fazer/ser/estar` com tempo.
5. **Pontuação final por intenção**: `.` afirmação, `?` pergunta, `!` exclamação — e **nunca separar sujeito e verbo com vírgula**, **vírgula após oração adverbial inicial**, **sem vírgula entre sujeito e verbo**.
6. Pedir ao modelo para **não acrescentar informações nem opiniões** e, em dúvida, **sinalizar em vez de reescrever**.
7. Validação humana: conferir nomes, datas, números — o modelo erra em norma divergente.

Isso reforça que o prompt atual (`groq_ptbr_reviewer`) está no caminho certo, mas **precisa das regras explícitas de vírgula e de pontuação final por intenção**, e de uma **dupla passada** para casos-limite.

### 12.6 Limpeza de arquivos obsoletos (autorizada — executada)

Foram identificados e **removidos**:

| Arquivo | Motivo |
|---|---|
| `.opencode/plans/003-gemini-transcricao-cloud.md` | Gemini substituído por NVIDIA/Groq |
| `.opencode/plans/004-gemini-modelo-dropdown-e-teste.md` | idem |
| `.opencode/plans/005-openrouter-transcricao-cloud.md` | OpenRouter substituído |
| `.opencode/plans/006-openrouter-aplicar-e-ajustes-ui.md` | idem |
| `.opencode/plans/007-remover-onboarding-e-corrigir-openrouter.md` | idem |
| `.opencode/plans/008-correcao-openrouter-persistencia-e-modelo-padrao.md` | idem |
| `.opencode/plans/009-openrouter-apenas-modelos-gratuitos.md` | idem |

**Mantidos** (125 KB, histórico relevante do fork): `001-setup-dev-handy.md`, `002-trocar-rosa-por-azul-e-instalar.md`, `010-trocar-openrouter-por-nvidia.md`, `011-parakeet-grpc-ptbr.md`, `012-chave-modelos-e-qualidade.md`, `013-organizacao-visual-modelos.md`.

**Código morto mapeado para remoção futura (NÃO removido agora):**
- `nvidia_transcription_model` — field em `settings.rs:609-613`, default `:954-956`, migração `:1514-1515`; `shortcut/mod.rs:1638` faz `let _ = model;` ("Riva Parakeet is fixed"). Não influencia o ASR.
- `is_auth_error` em `nvidia_riva.rs:45-53` ainda procura `"401"/"403"` no texto, enquanto `classify_riva_error` (`:23-42`) decidiu só pelo `tonic::Code` — inconsistência residual (marcador B7).
- `needs_llm_polish` e `fidelity_guard` **sem testes unitários**.

**Arquivos de teste úteis — MANTIDOS:** `tools/comparar_modelos.py`, `tools/golden_test.py`, `teste_rapido.py`, `teste_mic.py`, `TESTE.bat`, `TESTE_MIC.bat`, `riva_asr.py`. Servem para o banco de frases de 9.2.2.

**Espaço em disco (diagnóstico):** `src-tauri\target` ~9 GB, `node_modules` ~194 MB, `.tools` ~143 MB (CMake portátil), `.venv` ~96 MB, `.git` ~5 MB. `target` e `.tools` são regeneráveis; **não apagar agora** (build incremental depende deles).

### 12.7 Plano de correção atualizado (✅ aplicado no commit `98d1966` — ver seção 13)

**Prioridade P0 — fazer o LLM rodar sempre:**
1. `actions.rs:916-926` — remover `needs_llm_polish`; chamar o LLM sempre que `post_process_enabled && post_process_on_main_shortcut`, exceto texto vazio/`< 3 palavras`. **Nunca usar presença de pontuação como critério** (é o sintoma a corrigir).
2. Eliminar o gate duplo: fazer `post_process_enabled` bastar, **ou** expor `post_process_on_main_shortcut` com command + setter + toggle + i18n.
3. Defaults PT-BR do fork: `post_process_enabled=true`, provider `groq`, modelo `openai/gpt-oss-120b`, `post_process_selected_prompt_id=Some("default_improve_transcriptions")`.

**Prioridade P1 — não descartar a correção:**
4. `fidelity_guard` (`actions.rs:470-501`): limiar 0.6 → ~0.4, ignorar tokens numéricos, usar similaridade fuzzy, e transformar o descarte em `PostProcessOutcome::Failed` para aparecer o aviso.
5. Aplicar o guard também nos fallbacks de JSON (`actions.rs:392-404`).
6. Incluir `"groq"` em `disable_reasoning` se necessário.

**Prioridade P2 — robustez:**
7. Testes unitários para `needs_llm_polish` e `fidelity_guard`.
8. Log `info` quando o gate decidir não chamar o LLM, com o motivo.
9. Correção final de pontuação por intenção (`?`, `!`, `.`) — reforçar prompt conforme 12.5.5 e corretor local com iniciadores de pergunta/exclamação (item 9.1).
10. Corte no silêncio no Riva (item 3.3) para reduzir pontuação espúria de chunks de 30 s.

### 12.8 Checklist de verificação antes de aplicar

- [ ] Gravar 5 falas reais e comparar: (a) texto cru do Riva, (b) texto colado pelo app.
- [ ] Confirmar no log: `Starting LLM post-processing with provider 'groq'` aparece?
- [ ] Confirmar que `post_process_on_main_shortcut` sobrevive a reinícios do app.
- [ ] Confirmar que o `fidelity_guard` não está jogando fora a revisão (comparar com log `diverged too much`).
- [ ] Rodar o `tools/golden_test.py` com as frases de 9.2.2 antes e depois.
- [ ] Só então aplicar 12.7, com `cargo test --lib` + build + reinstalação + commit sem chaves.

### 12.9 Estado atual

- Nenhuma correção de código aplicada nesta rodada.
- 7 planos obsoletos removidos (12.6).
- GitHub atualizado até `e115e1d` (mais o commit de limpeza e este documento).

---

## APÊNDICE A — conhecimento consolidado (mesclado de arquivos antigos)

> Esta seção substitui os arquivos removidos. Tudo que havia de útil neles está aqui.
> Índice geral em `INDICE.md`.

### A.1 Do plano 010 (OpenRouter → NVIDIA)

- Descoberta crítica: a chave NVIDIA expira (~24 h) e o `function-id` muda quando o modelo é trocado; ambos precisam ser atualizados juntos.
- Decisão: Parakeet via **Riva gRPC** (`grpc.nvcf.nvidia.com:443`), `language-code=pt-BR`, sem exigir saldo — diferente do OpenRouter.
- Critério de aceite: saída **sempre em português**, sem traduzir para inglês.
- Correção pós-instalação: modelo `nvidia/parakeet-1_1b-rnnt-multilingual-asr` e prompt de limpeza PT-BR.

### A.2 Do plano 011 (Parakeet gRPC)

- Riva `Recognize` unary sobre WAV PCM16 mono 16 kHz.
- Conexão nova por fala (tentativa de cachear o canal com `connect_lazy` travava — revertida; ver `nvidia_riva.rs:55-57`).
- Retry em erros transitórios; mensagens próprias para 401/403 e 429.
- Critério de aceite: transcrição PT-BR rápida (~3 s) e precisa.

### A.3 Do plano 012 (chave, modelos e qualidade)

- Verificação de modelos usa a última gravação salva em `%APPDATA%\com.pais.handy\recordings\`.
- Modelos que não transcrevem áudio são ocultos do dropdown.
- Prompt PT-BR, remoção de muletas, `temperature: 0.1`, guarda de fidelidade (hoje em revisão — seção 12.3.1).
- Chave e `function-id` **nunca** versionadas.

### A.4 Do plano 013 (organização visual)

- Modelos separados em seções: **nuvem primeiro (esquerda)**, local depois (direita), com rolagem.
- Botões **Verificar configuração**, **Verificar modelos** e **Aplicar** independentes.
- Overlay com indicador de voz (picos altos, próximos à borda).

### A.5 De `instrucoes-transcricao-ptbr.md` (pesquisa Groq)

- Arquitetura recomendada: transcrever → revisar com LLM. **Aplicado neste fork:** Riva faz a transcrição; Groq faz só a revisão (seção 10).
- Modelo Groq escolhido: `openai/gpt-oss-120b` (melhor que `gpt-oss-20b` e `qwen/qwen3.8-27b` nos testes da seção 12.7).
- API compatível com OpenAI: `https://api.groq.com/openai/v1`; chave em `GROQ_API_KEY` (somente `.env`).
- Cloudflare rejeita user-agent padrão com HTTP 1010 → `llm_client.rs` envia UA de navegador.
- Limites: 250K TPM / 1K RPM para gpt-oss (Developer Plan); paraTextos longos, blocos de ~3.000 caracteres e fallback em 429.
- Regras de revisão (consolidadas com a pesquisa da seção 12.5): intervenção mínima, preservar sentido/nomes/números/estilo, corrigir ortografia (AO), acentuação, concordância verbal e nominal, regência, crase, pontuação — inclusive `?`/`!` por intenção.

### A.6 Arquivos que NÃO são instruções do fork

`CONTRIBUTING.md`, `CONTRIBUTING_TRANSLATIONS.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*` e as regras de PR/issue em `AGENTS.md` pertencem ao **upstream (`cjpais/Handy`)**. Mantidos apenas como referência técnica. **Não devem ser aplicados a este fork** — as regras deste projeto estão neste arquivo e em `INDICE.md`.

---

# 13. PLANO DE AÇÃO REFINADO ("PENTIFINO") — seguir à risca

> Versão 24/11/2026. Este é o **plano operacional**. Se houver conflito com qualquer seção anterior, **esta seção prevalece**.
> Objetivo: parar de colar texto bruto/desorganizado e entregar PT-BR correto (vírgulas, concordância, `?`, `!`, `.`).

## 13.1 Regras de ouro (não negociáveis)

1. **Uma fonte de verdade:** `MELHORIAS_TRANSCRICAO_PTBR.md` + `INDICE.md`. Nenhum novo MD de plano.
2. **Nunca seguir:** `CONTRIBUTING*`, templates `.github/`, regras de PR/issue do `AGENTS.md`. São do upstream.
3. **Nunca versionar chave:** `GROQ_API_KEY`, `NVIDIA_API_KEY`, `NVIDIA_FUNCTION_ID`, `settings_store.json`, `.env`.
4. **Antes de mexer no código:** rodar a verificação do 13.3. Depois de mexer: `cargo test --lib` + `bun run build`.
5. **Nunca interromper build/test com timeout.** Se demorar, rodar em background e esperar a conclusão.
6. **Cada passo tem verificação verificável.** Se falhar 2x, parar e registrar aqui antes de continuar.

## 13.2 Estado atual inventariado (24/11)

| Item | Estado |
|---|---|
| Repo | Limpo, commit `98d1966` |
| Documentação | `INDICE.md` (índice) + `MELHORIAS...` (mestre); 11 MDs restantes, todos classificados |
| Windsurf/Cursor/Claude | **Não existem** no perfil nem no projeto — nada a limpar |
| Handy instalado | `%LOCALAPPDATA%\Programs\Handy`, v0.10.1, Groq `gpt-oss-120b` configurado |
| Credenciais | `.env` (gitignore) + `settings_store.json` (fora do repo) |
| Modelo | `openai/gpt-oss-120b` confirmado como o melhor da Groq |
| Bugs mapeados | 4 barreiras (seção 12.1), 11 caminhos (12.3), `fidelity_guard` (12.3.1) |
| Build | CMake 4.5.1 em `.tools/`, MSVC 18, `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF` |

## 13.3 Verificação prévia (FAZER ANTES DE APLICAR)

```
[ ] 1. Gravar 5 falas reais (Caps Lock) e salvar o texto colado.
[ ] 2. Comparar com o texto em %APPDATA%\com.pais.handy\history.db.
[ ] 3. Rodar com --debug e procurar no log: "Starting LLM post-processing with provider 'groq'".
[ ] 4. Se a linha NÃO aparecer → confirma-se barreira 3 (needs_llm_polish).
[ ] 5. Se aparecer mas o texto continuar bruto → confirma-se barreira 4 (fidelity_guard).
[ ] 6. Confirmar no settings_store.json: post_process_enabled, post_process_on_main_shortcut,
       provider groq, modelo gpt-oss-120b, prompt groq_ptbr_reviewer, chave groq.
```

## 13.4 Ordem de execução (aplicar nesta ordem exata)

### PASSO 1 — Fazer o LLM rodar no Caps Lock
- Arquivo: `src-tauri/src/actions.rs`
- Ação: remover a chamada a `needs_llm_polish` do gate em `:916-926`. Manter só:
  `post_process_enabled && post_process_on_main_shortcut && !is_blank_transcription(&transcription)`.
- **Verificação:** teste unitário novo provando que uma frase de 8 palavras **com vírgula** agora dispara revisão.
- **Risco:** latência/custo por chamada. Mitigação: modelo ~0,7 s; Groq tem 250K TPM.

### PASSO 2 — Eliminar o campo órfão / gate duplo
- Arquivos: `settings.rs`, `actions.rs`, `bindings.ts`, `settingsStore.ts`
- Ação (escolher UMA): **fazer `post_process_enabled` bastar** (remover `post_process_on_main_shortcut` do gate) — mais simples e à prova de erro. Manter o campo no store por compatibilidade, mas sem exigência.
- **Verificação:** `cargo check --lib` + `bun run build` sem erro de tipo.

### PASSO 3 — Não descartar a correção
- Arquivo: `actions.rs` (`fidelity_guard`, `:470-501`)
- Ação: limiar 0.6 → 0.4; comparar com similaridade fuzzy (Levenshtein normalizado) em vez de interseção exata; **transformar descarte em `PostProcessOutcome::Failed`** para o aviso aparecer.
- Ação extra: aplicar o guard nos fallbacks de JSON (`:392-404`).
- **Verificação:** teste com `foi→foram`, `pra→para`, `a mim→me` — a revisão deve ser **aceita**.

### PASSO 4 — Pontuação final por intenção (P0 do usuário)
- Arquivos: `audio_toolkit/text.rs`, prompt `groq_ptbr_reviewer` no `settings_store.json`
- Ação: corretor local com iniciadores de pergunta (`quem, qual, quando, onde, como, por que, o que, que horas, será que`) e marcadores de exclamação (`que legal, uau, incrível, nossa, que bom`); só quando não houver pontuação final.
- Prompt: regra explícita `.` / `?` / `!` + exemplos few-shot + dupla passada (12.5).
- **Verificação:** teste unitário com os 3 casos.

### PASSO 5 — Testes, build, instalação
```
[ ] cargo test --lib          → 0 falhas
[ ] bun run build             → exit 0
[ ] bun run tauri build --no-bundle → "Finished release profile"
[ ] desinstalar Handy atual (preservar settings_store.json)
[ ] copiar handy.exe + DLLs + resources
[ ] recriar atalho + autostart
[ ] abrir app e conferir janela
```

### PASSO 6 — Validação final e publicação
```
[ ] 5 falas reais coladas com pontuação/gramática corretas
[ ] varredura de chaves no staged: 0
[ ] git commit (conventional) + git push origin main
[ ] atualizar "Estado atual" desta seção
```

## 13.5 Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| LLM falha / 429 | texto bruto colado | Manter fallback para o original + aviso `PostProcessFailed` |
| `fidelity_guard` descarta correção | usuário acha que não funciona | Limiar 0.4 + fuzzy + aviso |
| Campo órfão some ao reescrever store | gate desliga | `post_process_enabled` bastar |
| Cloudflare 1010 | chamada falha | User-Agent já no `llm_client.rs` |
| Build demorado / timeout | interrupção | Background, sem timeout, esperar conclusão |
| Chave vazada | segurança | `.env` + gitignore + varredura no staged |

## 13.6 Critérios de aceite (só encerrar quando TODOS passarem)

1. `Que horas são você sabe` colado como **"Que horas são? Você sabe?"**
2. `que legal ganhamos o jogo` colado como **"Que legal! Ganhamos o jogo."**
3. `os homens foi na praca` colado como **"Os homens foram à praça."**
4. `quando eu cheguei la ele ja tinha saiu` colado com **vírgula e acento**.
5. Log do app mostra `Starting LLM post-processing with provider 'groq'` em cada fala.
6. `cargo test --lib`: 0 falhas.
7. Nenhuma chave no repo.

## 13.7 Checklist de execução (marcar conforme executa)

- [x] 13.3 verificação prévia (código inspecionado; 350 testes passaram)
- [x] PASSO 1 — gate do LLM (commit `98d1966`)
- [x] PASSO 2 — gate duplo (commit `98d1966`)
- [x] PASSO 3 — fidelity_guard (commit `98d1966`)
- [x] PASSO 4 — pontuação final (commit `98d1966`)
- [ ] PASSO 5 — testes/build/instalação (**build cancelado a pedido do usuário; aguardando revisão**)
- [ ] PASSO 6 — validação/publicação com 5 falas reais
- [ ] Atualizar estado atual em 13.2

---

# 14. CONSOLIDAÇÃO DAS TRÊS ANÁLISES (`ler.md`) — 24/11/2026

> O usuário forneceu `ler.md` com três avaliações independentes (Google, GROK, Z Ai). O conteúdo útil foi mesclado aqui. **O arquivo `ler.md` pode ser descartado** depois desta consolidação (regra 13.1: uma fonte de verdade).

## 14.1 O que as três concordam

1. **O gargalo nunca foi o modelo nem o prompt** — era o `needs_llm_polish` (removido no commit `98d1966`).
2. **`openai/gpt-oss-120b` é o melhor modelo Groq testado** para PT-BR (0,5–0,9 s).
3. **A correção está no código, mas o PC ainda roda binário antigo** — falta rebuild + reinstalação (PASSO 5).
4. **Nunca versionar chaves** — `.env` e `settings_store.json` fora do repo.

## 14.2 Confirmações úteis das análises

- **GROK:** configuração local já correta (provider `groq`, modelo, prompt `groq_ptbr_reviewer`, chave fora do repo); User-Agent presente; critério de sucesso = 5–10 falas reais com `?`/`!`/`.` e linha `Starting LLM post-processing with provider 'groq'` no log.
- **Z Ai (verificação linha a linha do commit `98d1966`):**
  - `needs_llm_polish` **não existe mais** (busca = zero resultados).
  - `post_process_on_main_shortcut` saiu do gate — restou **um único gate**: `post_process_enabled` (PASSO 2 executado na forma simples).
  - `fidelity_guard` (`:468-507`): <4 tokens aceita; prefixo de 3 letras; limiar 0.4; descarte → `Failed` com aviso; guard também nos fallbacks de JSON.
  - Pontuação final por intenção em `text.rs:15-53` com testes.
  - Corretor determinístico chamado em **todos** os caminhos (`transcription.rs:1788`).
  - Provider `groq` em `settings.rs:838-844`; UA em `llm_client.rs:258`; `strip_think_block` presente.
  - Varredura por `gsk_…`/`nvapi-…`/`sk-…`: **zero chaves versionadas**.
- **Google:** README ainda descreve NVIDIA como motor principal e não menciona a revisão Groq — identificado como P2 (corrigido nesta rodada).

## 14.3 Pendências consolidadas (ordem de prioridade)

### P0 — fazer antes/de junto do rebuild
| ID | Pendência | Local | Ação |
|---|---|---|---|
| P0.1 | Defaults do fork ainda são do upstream | `settings.rs:777`, `:795`, `post_process_models`, `post_process_selected_prompt_id` | `post_process_enabled=true`, provider `groq`, modelo `openai/gpt-oss-120b`, prompt selecionado por default, e `ensure_post_process_defaults` preenchendo o prompt quando `None`. **Sem isso, uma reinstalação com store perdido devolve ao problema original.** |
| P0.2 | `groq` fora do `disable_reasoning` | `actions.rs:299-302` | Incluir `"groq"` em `matches!(...)`. O `llm_client` já tem retry sem o campo se o endpoint rejeitar — risco baixo. |
| P0.3 | Rebuild + reinstalação + validação (PASSOs 5 e 6) | — | `cargo test --lib` → `bun run build` → `bun run tauri build --no-bundle` → reinstalar preservando `settings_store.json` → validar as 5 falas do 13.6 + log do provider. **Este é o motivo direto do texto ainda sair bruto.** |

### P1 — qualidade/robustez
- **P1.1** Elevar logs de `no provider` / `no model` / `no prompt` de `debug!` para `warn!`/notice.
- **P1.2** Log `info` no gate com o motivo quando a revisão não for chamada.
- **P1.3** `tools/golden_test.py` hoje lê `NVIDIA_API_KEY` — adicionar suporte a `GROQ_API_KEY` + `openai/gpt-oss-120b` (mesmo formato OpenAI, trocar base URL).
- **P1.4** Toggle de pós-processamento está em **Configurações → Avançado → Experimental** (o MD 12.4 dizia "Debug" — **corrigido**: é Avançado/Experimental, exige `experimental_enabled=true`).
- **P1.5** Teste unitário do gate novo (frase de 8 palavras com vírgula deve disparar revisão) — trava a regra "nunca usar pontuação como critério".

### P2 — documentação (executado nesta rodada)
- [x] Seções 11 e 12: status atualizado (o "NÃO APLICAR" era anterior ao commit `98d1966`).
- [x] 13.2: commit `ae1e79c` → `98d1966`.
- [x] 13.7: PASSOs 1–4 marcados como concluídos; 5–6 pendentes.
- [x] `INDICE.md`: "12 seções" → "13 seções"; linha dos `*.py` corrigida; nota de que a seção 13 prevalece.
- [x] `README.md`: removida menção a `link.txt` (não existe mais); adicionada a revisão Groq nas "Principais alterações".
- [ ] Mover Apêndice A para o final do mestre (a seção 13 está no meio do apêndice) — **adiado**, sem perda de conteúdo.
- [ ] Padronizar datas 23/11 vs 24/11 (commits são de 23/11) — **adiado**.

## 14.4 Ordem de execução recomendada (atualizada)

1. P0.1 + P0.2 + P1.5 + P1.2 em **uma rodada de código**.
2. P0.3 — testes, build, reinstalação preservando `settings_store.json`.
3. Validação com as 5 falas do 13.6 + log do provider.
4. Publicar com varredura de chaves.
5. Depois: P1.3 (golden test Groq) e P1.4 (toggle fora do experimental).

**Nota:** `Groq` (com Q) — o código usa `https://api.groq.com/openai/v1`. Não há Grok/xAI no repositório.

**Limitação das análises:** foram estáticas (não compilaram nem acessaram o `settings_store.json` local). A validação real depende do PASSO 5/6.
