# 003 - Transcrição em nuvem com Gemini (chave de API)

## Contexto e objetivo
O Handy (fork atual) realiza transcrição de áudio localmente via `transcribe-cpp` (Whisper/Parakeet etc.). O usuário relata baixa precisão em português (PT-PT) com os modelos locais e deseja poder usar o **motor de transcrição do Google Gemini via API**, informando a **chave de API** para configuração automática, em vez de depender do motor local.

**Objetivo:** adicionar suporte a transcrição de áudio por API do Gemini neste app, com campo para inserir a chave de API da Gemini e uso do provedor Gemini quando configurado, mantendo o modo local existente.

## Não-objetivos
- Não remover nem quebrar o fluxo de transcrição local existente.
- Não implementar, nesta etapa, múltiplos provedores de transcrição em nuvem (além de Gemini) — estrutura pode ser extensível, mas foco é Gemini.
- Não implementar streaming/live preview em tempo real via API Gemini nesta etapa (a transcrição em nuvem será feita sobre o áudio gravado ao finalizar a gravação/batch).
- Não alterar o pós-processamento LLM existente (exceto se necessário para compatibilidade).
- Não implementar upload via Files API do Google nesta etapa (usar `inline_data`/base64 para áudio gravado típico).
- Não garantir suporte a todos os modelos/contas Gemini; usar endpoint/modelo padrão configurável com fallback de mensagens de erro claras.

## Decisões técnicas + alternativas descartadas
- **Provedor alvo (MVP): Gemini (Google AI / Generative Language API)** com autenticação por **API key**.
  - *Alternativa descartada:* Google Cloud Speech-to-Text — usa credenciais/projeto GCP diferentes; pedido explícito foi "chave da API da Gemini".
  - *Alternativa descartada:* usar apenas pós-processamento LLM — melhora texto, mas não resolve erros de reconhecimento do ASR local; pedido foi transcrição pelo motor do Google.
- **Integração na API Gemini:** usar **`generateContent`** (REST, `generativelanguage.googleapis.com`, API key via header `x-goog-api-key`) enviando áudio como `inline_data` (base64, `audio/wav`) + prompt de transcrição. Modelo padrão: `gemini-2.0-flash` (editável na UI para permitir modelos pagos/outros).
  - *Alternativa descartada:* Interactions API nova/SDKs JS/Python — backend é Rust; REST `generateContent` é direto com `reqwest` já presente.
  - *Alternativa descartada:* Files API upload — complexidade maior; gravações de ditado costumam caber no limite de requisição inline.
- **Configuração de engine:** adicionar **provedor de transcrição** (ex.: `local` | `gemini`) + **chave API Gemini** (secreta) + **modelo Gemini** (string editável, com padrão). Quando `gemini` estiver selecionado e chave presente, a transcrição usa Gemini; caso contrário, usa fluxo local.
  - *Alternativa descartada:* tratar Gemini como "modelo" na lista de modelos locais (`ModelManager`) — exigiria grande refatoração do catálogo/download/capabilities; mais simples separar engine de transcrição em nuvem.
- **UI (ajuste solicitado):** colocar as configurações do Gemini na **seção Modelos** da UI (área descritiva/organizada), incluindo seleção/ativação do modo Gemini, campo de chave de API e campo de modelo (para uso de modelos pagos/outros).
- **Fluxo de áudio:** converter `Vec<f32>` (16 kHz mono) para WAV em memória (via `hound`) e codificar em base64 (adicionar crate `base64`) antes de enviar.
- **Streaming/live preview:** desativar preview em streaming quando usar Gemini; transcrever o áudio completo no final (`transcribe_recording`/caminho batch equivalente) e retornar texto.
- **Segurança/UX:** armazenar chave como segredo (padrão de redação similar ao pós-processamento), não registrar chave em logs/erros, e informar que o áudio será enviado ao Google quando Gemini estiver ativo.

## Arquivos previstos para tocar/criar (caminho exato)
> Lista prevista com base na arquitetura atual; pode ser ajustada minimamente durante implementação, mantendo escopo.

- `Handy\src-tauri\Cargo.toml` — adicionar dependência `base64` (e demais necessárias, se houver).
- `Handy\src-tauri\src\settings.rs` — novos campos/config de transcrição em nuvem (provider, chave Gemini, modelo), defaults, migração/backfill, helpers/redação.
- `Handy\src-tauri\src\gemini_transcription.rs` (novo) — cliente/integração Gemini: montagem de WAV/base64, chamada HTTP, parsing da resposta, erros.
- `Handy\src-tauri\src\lib.rs` e/ou `Handy\src-tauri\src\main.rs`/módulos — registrar novo módulo/comandos conforme padrão.
- `Handy\src-tauri\src\shortcut\mod.rs` (ou módulo de comandos apropriado) — comandos Tauri para ler/alterar provider/chave/modelo de transcrição Gemini.
- `Handy\src-tauri\src\managers\transcription.rs` — ramificar transcrição para usar Gemini quando configurado (batch/final), respeitando cancelamento/erros/notices e evitando exigir modelo local carregado nesse modo.
- `Handy\src-tauri\src\actions.rs` — ajustar preflight/início/fim da gravação para modo Gemini (não depender de modelo local carregado/stream local quando aplicável).
- `Handy\src-tauri\src\commands\transcription.rs` e/ou `Handy\src-tauri\src\commands\models.rs` — expor estado/config necessário ao frontend (se aplicável).
- `Handy\src\bindings.ts` — atualizar bindings gerados para novos comandos/tipos.
- `Handy\src\stores\settingsStore.ts` e `Handy\src\hooks\useSettings.ts` — suporte a novas configurações/comandos.
- `Handy\src\components\settings\...` (ex.: `general/`, `models/` ou nova seção de transcrição) — UI para selecionar Gemini, inserir chave de API e (opcional) modelo/avisos.
- `Handy\src\i18n\locales\en\translation.json` e demais locales — novas strings de UI (conforme regras do projeto).
- `Handy\.opencode\plans\003-gemini-transcricao-cloud.md` — este plano (atualização de status).

## Passos numerados

- [x] 1. Mapear pontos de integração exatos no código atual (baseline técnico)
      - resultado: mapeados `AppSettings`/defaults/migrações em `src-tauri/src/settings.rs`, preflight/start/stop em `src-tauri/src/actions.rs`, `transcribe_recording`/`complete`/`decode_batch` em `src-tauri/src/managers/transcription.rs`, comandos/settings em `src-tauri/src/shortcut/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/*`, UI de modelos em `src/components/settings/models/ModelsSettings.tsx`, store/hooks/bindings em `src/stores/settingsStore.ts`, `src/hooks/useSettings.ts`, `src/bindings.ts`, e uso de `hound`/WAV/base64.
      - verificação: leitura/inspeção dos pontos reais de integração antes da implementação.
      - arquivos: leitura/análise.

- [x] 2. Adicionar configurações de transcrição Gemini (backend + persistência)
      - resultado: adicionados `TranscriptionProvider` (`local`/`gemini`), `transcription_provider`, `transcription_api_keys` (`SecretMap`, chave `gemini`, redatada no debug), `gemini_transcription_model` (default `gemini-2.0-flash`), defaults/helpers e comandos Tauri para alterar provider/chave/modelo.
      - verificação: inspeção do código e integração com comandos/serialização; `cargo check` não pôde ser concluído no ambiente por ausência de `cmake` no PATH (falha em `transcribe-cpp-sys` build script), não por erro identificado nestas alterações.
      - arquivos: `src-tauri/src/settings.rs`, `src-tauri/src/shortcut/mod.rs`, `src-tauri/src/lib.rs`.

- [x] 3. Implementar cliente de transcrição Gemini (áudio → texto)
      - resultado: criado módulo `gemini_transcription` para converter PCM 16 kHz mono em WAV (`hound`), codificar em base64, chamar `generateContent` (`generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key`) com prompt de transcrição e parsear resposta/erros; inclui versão blocking para uso no fluxo síncrono de transcrição.
      - verificação: implementação revisada; `cargo check` bloqueado no ambiente por dependência nativa (`cmake` ausente) durante build de `transcribe-cpp-sys`.
      - arquivos: `src-tauri/src/gemini_transcription.rs` (novo), `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`.

- [x] 4. Integrar Gemini ao fluxo de transcrição/gravação
      - resultado: `TranscriptionManager::complete` usa Gemini quando configurado (sem exigir modelo local carregado) e aplica pós-processamento local de texto; `actions.rs` bloqueia início se Gemini selecionado sem chave, evita pré-carregamento/streaming local no modo Gemini e mantém caminho local preservado.
      - verificação: inspeção do fluxo e `bun run build` do frontend ok; `cargo check` bloqueado por ambiente (`cmake` ausente para `transcribe-cpp-sys`). Teste manual com chave Gemini real não executado neste ambiente.
      - arquivos: `src-tauri/src/managers/transcription.rs`, `src-tauri/src/actions.rs`.

- [x] 5. Expor comandos/configuração e atualizar UI (chave Gemini + seleção)
      - resultado: UI de **Modelos** agora inclui seção "Transcription engine" com seleção Local/Gemini, campo de chave API Gemini e campo de modelo (editável, ex. modelos pagos), aviso de envio de áudio à nuvem; store/hooks/bindings/locais atualizados.
      - verificação: `bun run build` em `Handy` concluído com sucesso (exit 0). `src/bindings.ts` atualizado manualmente para novos comandos/campos (gerado automaticamente via tauri-specta em build/debug do app).
      - arquivos: `src-tauri/src/shortcut/mod.rs`, `src-tauri/src/lib.rs`, `src/bindings.ts`, `src/stores/settingsStore.ts`, `src/hooks/useSettings.ts`, `src/components/settings/models/ModelsSettings.tsx`, `src/components/ui/index.ts`, `src/i18n/locales/*/translation.json`.

- [ ] 6. Validar ponta a ponta e documentar uso
      - resultado: validação parcial realizada (frontend build ok). Validação Rust/app e teste E2E com chave Gemini pendentes no ambiente atual.
      - verificação: `bun run build` (exit 0). `cargo check --manifest-path src-tauri/Cargo.toml` falhou no ambiente por `cmake` ausente (`failed to execute command: program not found` em `transcribe-cpp-sys`), impedindo concluir verificação backend completa aqui.
      - arquivos: sem atualização de README nesta etapa (feature implementada; documentação de uso pode ser expandida).

- [ ] 7. Relatar resultado, limitações e próximos passos
      - resultado: em andamento (resumo final para o usuário).
      - verificação: relatório entregue na resposta.
      - arquivos: nenhum (relatório).

## Riscos e como detectar
- **Contrato da API Gemini (endpoint/modelo/payload/resposta) mudar ou não corresponder ao esperado:** detectar por erros HTTP/parsing em testes manuais; mitigar com mensagens de erro detalhadas (status/corpo sanitizado) e modelo configurável.
- **Áudio grande excede limite de `inline_data`:** detectar por erro 413/tamanho; mitigar limitando/avisando (gravações de ditado curtas geralmente ok) ou planejar Files API depois.
- **Chave de API exposta em logs/UI inadequada:** detectar revisando logs/redação (`SecretMap`/não imprimir segredo); tratar chave como sensível.
- **Refatoração do fluxo de transcrição quebrar modo local/streaming:** detectar com `cargo check`, `bun run build` e testes manuais de gravação local; preservar caminho local por padrão.
- **Regeneração de bindings inconsistente:** detectar por erros de tipos no frontend; atualizar `bindings.ts` conforme mudanças Rust/tauri-specta.
- **Idioma/PT-PT:** qualidade depende do modelo/prompt; detectar em testes reais; permitir prompt/modelo adequados e documentar.

## Critérios de aceite
- Existe um **campo/configuração para chave de API Gemini** persistida de forma segura e utilizável no app.
- Quando Gemini está selecionado e configurado, a transcrição de uma gravação usa a **API Gemini** (motor em nuvem) em vez do motor local, retornando texto ao fluxo normal do Handy.
- Quando modo local está selecionado (ou Gemini não configurado), o comportamento local atual permanece funcional.
- Build/verificações viáveis do projeto passam após as mudanças (ou bloqueios são explicitamente documentados).
- Usuário recebe instruções claras de como configurar e usar; limitações (privacidade/envio de áudio à nuvem, ausência de streaming live na nuvem) são informadas.
- Nenhuma implementação iniciada antes da aprovação explícita ("OK") deste plano.