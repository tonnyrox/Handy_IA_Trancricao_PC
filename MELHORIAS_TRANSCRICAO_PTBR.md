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
