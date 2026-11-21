# 008 - Correção OpenRouter: persistência do engine, modelo padrão e transcrição por Caps Lock

## Contexto
O usuário reportou, após a versão 007 (que removeu com sucesso as 5 etapas de onboarding), problemas persistentes e críticos:

1. **Seleção do engine OpenRouter não persiste:** ao escolher OpenRouter no dropdown e trocar de modelo, a seleção não fica salva. A chave está inserida e já foi verificada com sucesso, mas o estado volta para `local`.
2. **Modelo preferencial inicial desejado:** `google/gemini-2.5-flash` (Gemini 2.5 Flash, com suporte a áudio) deve ser o modelo pré-selecionado por padrão no OpenRouter, já pronto para **Aplicar**.
3. **Modelo local aparece "sem download / coloca auto" e Caps Lock não transcreve:** com o Whisper Large V3 Turbo aparecendo como ativo sem modelo baixado, ao pressionar **Caps Lock** o áudio é captado, mas **não há transcrição** — o áudio não passa adiante.
4. ** ponto positivo:** as 5 etapas de abertura foram removidas (resolvido).

O usuário pediu explicitamente notas em Markdown com: o que **não deseja** (anti-requisitos), o que **está faltando no planejamento**, e um planejamento **do começo ao fim** para organizar o sistema.

---

## Anti-requisitos (o que NÃO pode ter / nunca mais fazer)
- ❌ **Nenhuma tela/fluxo de onboarding por etapas** (1-5, "experimente", "selecione idioma", download guiado, "all set"). Abertura sempre direta no app. Já removido; manter removido.
- ❌ **Não reintroduzir wizard, passo a passo, apresentação ou interface "bonitinha" que não foi pedida.**
- ❌ **Não alterar telas ou comportamentos fora de Configurações > Modelos / engine de transcrição**, exceto o mínimo técnico para corrigir os bugs listados.
- ❌ **Não expor a chave da API** em logs, mensagens, plano ou respostas.
- ❌ **Não modificar modelos baixados nem dados do usuário** (`%APPDATA%\com.pais.handy\models`, histórico, gravações).
- ❌ **Não adicionar modelos preferenciais "bonitinhos" extras** no dropdown sem necessidade; apenas o modelo que o usuário pediu.

---

## Diagnóstico raiz (causa provável confirmada por evidência)
**Bug de serialização do enum `TranscriptionProvider`:**
```rust
#[serde(rename_all = "snake_case")]
pub enum TranscriptionProvider {
    Local,
    #[serde(alias = "gemini")]
    OpenRouter,   // <-- serializa como "open_router", NÃO "openrouter"
}
```
- `rename_all = "snake_case"` transforma `OpenRouter` em **`"open_router"`**.
- O frontend usa **`"openrouter"`** em todo lugar (dropdown, `updateTranscriptionProvider`, checagens `=== "openrouter"`).
- Resultado em cadeia:
  - Ao escrever `"openrouter"` no `settings_store.json`, o backend **não reconhece** o valor (o único alias é `"gemini"`) e cai no `#[default] Local`, reescrevendo `"local"` no startup. → **seleção do engine não persiste / volta para Local**.
  - Quando a UI chama `change_transcription_provider_setting("openrouter")`, o backend salva `"open_router"`; o frontend lê `"open_router"` e **nenhuma checagem `=== "openrouter"` bate** → dropdown não reflete, modelo OpenRouter nunca aparece como ativo na lista inferior, `usePlace()` nunca retorna `"active"` para a entrada de nuvem.
  - `settings.is_openrouter_transcription_configured()` retorna `false` no startup → `actions.rs` entra no caminho **Local** e tenta usar modelo local (Whisper Large V3 Turbo, Many languages, low CPU) que não está baixado → **Caps Lock capta áudio mas não transcreve**.
- **Correção:** `#[serde(rename = "openrouter", alias = "gemini", alias = "open_router")]` na variante `OpenRouter` (manter `rename_all` para `Local`).

**Modelo padrão desejado:** `google/gemini-2.5-flash` — confirmado na API OpenRouter com `input_modalities` incluindo `audio` (ID exato listado). Substituir o atual `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` em:
- `default_openrouter_transcription_model()` (backend),
- fallback/recommended list em `openrouter_transcription.rs`,
- fallback do dropdown em `ModelsSettings.tsx`,
- `settingsStore.ts` (valor de normalização),
- `settings_store.json` local (pré-configuração).

---

## O que faltou no planejamento anterior (lições)
- O plano 006 assumiu que o valor `"openrouter"` era serializado fielmente; **não houve verificação de ida e volta (round-trip) do enum** entre frontend e backend. Faltou um teste de persistência explícito (escrever provider → reler → conferir).
- O plano 007 removeu onboarding e ajustou auto-seleção, mas **não diagnosticou a raiz da reversão do provider** (atribuiu a "auto-seleção local"), então o problema persistiu.
- Faltou **validação ponta a ponta da transcrição** (Caps Lock → áudio → engine OpenRouter → texto). Os testes anteriores cobriram apenas autenticação/texto da API, não o caminho real do atalho.
- Faltou **alinhar o modelo padrão com a preferência do usuário** antes de buildar (foi escolhido modelo "free" sem confirmar o desejado).
- Faltou um **documento único de anti-requisitos** para evitar reintrodução de etapas/UI não pedida.

---

## Decisões técnicas
- Corrigir o enum com `rename = "openrouter"` + aliases (`gemini`, `open_router`) para garantir compatibilidade com stores já gravados pelo build que usava `open_router`.
- Definir `google/gemini-2.5-flash` como modelo padrão/preferencial e pré-aplicado no `settings_store.json` (já com a chave válida).
- Garantir que, com `provider=openrouter`, o backend **nunca** tente carregar modelo local e que a UI reflita o modelo OpenRouter como ativo (entrada sintética), com modelo local desmarcado.
- Validar o caminho real: **Caps Lock → gravação → chamada OpenRouter → texto inserido**, não apenas teste de texto da API.
- Manter as correções já feitas de onboarding removido e do botão Aplicar.

## Arquivos previstos
- `src-tauri/src/settings.rs` — enum `TranscriptionProvider` (rename/aliases) + `default_openrouter_transcription_model()`.
- `src-tauri/src/openrouter_transcription.rs` — lista/fallback de modelos recomendados (colocar `google/gemini-2.5-flash`).
- `src/components/settings/models/ModelsSettings.tsx` — fallback do dropdown + pré-seleção.
- `src/stores/settingsStore.ts` — normalização do modelo padrão.
- `src-tauri/src/actions.rs` / `managers/transcription.rs` — verificar caminho de transcrição OpenRouter (se necessário).
- `%APPDATA%\com.pais.handy\settings_store.json` — pré-configuração (provider=`openrouter`, modelo=`google/gemini-2.5-flash`, chave preservada, `selected_model` vazio, onboarding=true).
- `src-tauri/src/settings.rs` (testes) — teste de round-trip de serialização do provider.

## Passos numerados (planejamento do começo ao fim)
- [x] 1. Corrigir serialização do enum `TranscriptionProvider`
      - resultado: `#[serde(rename = "openrouter", alias = "open_router", alias = "gemini")]` aplicado; teste de round-trip adicionado.
      - verificação: `cargo test transcription_provider_serializes_as_openrouter` (em background) + `cargo check` via build.
      - arquivos: `src-tauri/src/settings.rs`.

- [x] 2. Definir `google/gemini-2.5-flash` como modelo padrão/preferencial
      - resultado: backend (`default_openrouter_transcription_model`, prioridade e fallback), frontend (`ModelsSettings`, `settingsStore`) e `settings_store.json` usam o modelo desejado. Encoding mojibake do `ModelsSettings.tsx` reparado.
      - verificação: `bun run build` OK.
      - arquivos: `settings.rs`, `openrouter_transcription.rs`, `ModelsSettings.tsx`, `settingsStore.ts`, `settings_store.json`.

- [x] 3. Garantir persistência do engine e reflexo do modelo ativo
      - resultado: correção do enum garante que `"openrouter"` seja lido/escrito corretamente; `settings_store.json` após abertura confirma `provider=openrouter`, `model=google/gemini-2.5-flash`, `selected_local=''`, chave presente. Logs confirmam `transcription_provider: OpenRouter` e `Skipping local model auto-selection because...`.
      - verificação: teste de round-trip (`ok`) + leitura do `settings_store.json` após abertura + logs.
      - arquivos: `settings.rs`, `actions.rs` (verificado, sem alteração necessária).

- [x] 4. Validar transcrição real por Caps Lock com OpenRouter
      - resultado: **caminho cloud confirmado nos logs** (`Using OpenRouter cloud transcription`, `Sending OpenRouter transcription request (model=google/gemini-2.5-flash ...)`) — o Caps Lock **agora passa adiante e chega na API**, ou seja, o bug de "capta áudio mas não transcreve" pelo caminho local está **resolvido**. **NOVO achado:** a API OpenRouter retorna **402 — "This request requires at least $0.50 in balance for audio"**: o modelo Gemini 2.5 Flash (pago) exige saldo mínimo na conta; a chave é válida, mas a conta não tem créditos suficientes para áudio nesse modelo. A falha de transcrição agora é de **saldo/crédito da conta OpenRouter**, não de código.
      - verificação: logs `handy.log` linhas 446/451 e 510/515 + teste de API.
      - arquivos: nenhum (validação). Próximo passo depende de decisão: usar modelo **gratuito** (ex.: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, que já funcionou antes) como padrão, ou o usuário adicionar créditos na conta OpenRouter para manter Gemini 2.5 Flash.

- [x] 5. Compilar, reinstalar (preservando modelos/dados), abrir e relatar
      - resultado: release compilado (14m35s), instalado manualmente em `%LOCALAPPDATA%\Programs\Handy`, atalho criado, app aberto; `settings_store.json` correto após abertura; modelos/dados preservados.
      - verificação: `handy.exe` 20/11/2026 21:44:41, app em execução, provider OpenRouter persistido, Caps Lock chegando à API (logs).
      - arquivos: artefatos de build/instalação; atualização deste plano.

## Riscos e como detectar
- **Modelo Gemini 2.5 Flash não aceitar `input_audio` na OpenRouter:** detectar no teste real; fallback para `google/gemini-2.5-flash-lite` (também com áudio) se falhar.
- **Stores já gravados com `"open_router"`:** mitigado com `alias = "open_router"`.
- **Reversão por outra escrita de settings:** detectar relendo o arquivo após cada etapa.

## Critérios de aceite
- Engine OpenRouter selecionado **continua salvo** após fechar e reabrir o app.
- Modelo `google/gemini-2.5-flash` vem **pré-selecionado** e aplicável por padrão.
- Apertar **Caps Lock** capta áudio **e transcreve** via OpenRouter (texto inserido).
- Modelo OpenRouter aparece como **ativo** na lista inferior; modelo local desmarcado.
- **Nenhuma etapa de onboarding** e nenhuma UI/fluxo não pedido.
- Chave nunca exposta; modelos/dados preservados.

**GATE:** responda **"OK"** ou **"pode executar"** para eu implementar este plano 008.
