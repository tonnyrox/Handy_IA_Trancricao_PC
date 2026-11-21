# 010 - Trocar OpenRouter por NVIDIA (cloud transcription, modelo gratuito)

## Contexto
Após múltiplos testes reais, a OpenRouter **sempre** exige saldo mínimo de $0.50 para qualquer requisição de áudio (`402`, `limit_source: openrouter_credits`), inclusive em modelos `free`. Não há workaround dentro dela. O usuário forneceu uma chave **NVIDIA** (`nvapi-...`), que foi **validada com sucesso**:
- `GET https://integrate.api.nvidia.com/v1/models` → 200 (33 modelos, chave válida).
- `POST /v1/chat/completions` com áudio WAV real (gravação em pt-BR) → **200, transcrição correta, sem saldo/cobrança**.
- Modelo usado: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (multimodal/áudio, consta na lista da chave).

Decisão do usuário: **remover OpenRouter completamente e usar apenas NVIDIA**, sempre com modelo gratuito.

## Detalhe técnico crítico (desc descoberto no teste)
O modelo é de **raciocínio**. Sem ajuste, a transcriação vai para `reasoning_content` e `content` fica `null`. Configuração correta validada:
- `chat_template_kwargs: { "thinking": false }` → `content` traz a transcrição limpa em pt-BR; `reasoning_content` = `None`.
- `max_tokens: 4096` (com `thinking` ligado, 1024 não bastava e o content ficava vazio).
- Formato de áudio OpenAI-compatible: `{ type: "input_audio", input_audio: { data: <base64>, format: "wav" } }`.
- Endpoint: `https://integrate.api.nvidia.com/v1/chat/completions`.
- Auth: `Authorization: Bearer <nvapi key>`.

## Anti-requisitos
- ❌ Não usar OpenRouter em nenhum lugar (código, UI, settings, defaults).
- ❌ Não usar modelo pago; apenas modelos disponíveis/gratuitos na chave NVIDIA.
- ❌ Não pedir saldo/crédito em momento algum.
- ❌ Não reintroduzir onboarding/etapas; abertura direta no app.
- ❌ Não expor a chave (logs, UI, mensagens).
- ❌ Não mexer em modelos baixados/dados do usuário.

## Decisões
- Substituir o módulo `openrouter_transcription.rs` por `nvidia_transcription.rs` (cliente NVIDIA: listar modelos, testar chave+modelo, transcrever áudio).
- Renomear provider `openrouter` → `nvidia` em: enum `TranscriptionProvider`, settings (`transcription_api_keys`, modelo padrão), comandos Tauri, bindings, hooks/stores, UI (ModelsSettings), i18n.
- Modelo padrão: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (gratuito, áudio, validado na chave). Dropdown mostra apenas modelos da chave NVIDIA; priorizar este modelo omni.
- Migrar settings legados: valores `openrouter`/`gemini` antigos no store → `nvidia`, chave antiga removida/não usada. Preservar chave NVIDIA nova.
- Teste interno (`Verificar`) usa o modelo padrão NVIDIA com áudio/texto e valida 200 sem 402.

## Arquivos previstos
- `src-tauri/src/nvidia_transcription.rs` (novo; substitui openrouter_transcription.rs) — cliente, list/test, transcrição com `thinking:false`.
- `src-tauri/src/settings.rs` — enum `TranscriptionProvider::Nvidia`, defaults, migração de legados, helpers (`is_nvidia_transcription_configured`).
- `src-tauri/src/actions.rs`, `src-tauri/src/managers/transcription.rs` — roteamento cloud → NVIDIA.
- `src-tauri/src/shortcut/mod.rs` — comandos `change_nvidia_transcription_api_key_setting`, `change_nvidia_transcription_model_setting`, `fetch_nvidia_transcription_models`, `test_nvidia_transcription`.
- `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs` — registro de comandos.
- `src-tauri/Cargo.toml` / `Cargo.lock` — se necessário (reqwest já existe).
- `src/bindings.ts` — novos comandos/tipos (`NvidiaModelOption` etc.), remover OpenRouter.
- `src/stores/settingsStore.ts`, `src/hooks/useSettings.ts` — ações NVIDIA, remover OpenRouter.
- `src/components/settings/models/ModelsSettings.tsx` — UI: chave NVIDIA, dropdown (só modelos da chave), Verificar, Aplicar, entrada ativa na lista inferior.
- `src/components/settings/models/modelEntries.ts`, `ModelRow.tsx` — entrada sintética `NVIDIA: <modelo>` ativa.
- `src/i18n/locales/*/translation.json` — chaves `nvidia.*` (remover openrouter.*).
- `%APPDATA%\com.pais.handy\settings_store.json` — provider `nvidia`, chave NVIDIA, modelo padrão, selected_model vazio.
- `src-tauri/src/settings.rs` (testes) — round-trip do enum `nvidia`.
- `Handy/.opencode/plans/010-trocar-openrouter-por-nvidia.md` — este plano.

## Passos numerados
- [x] 1. Criar cliente NVIDIA (nvidia_transcription.rs) com transcrição `thinking:false` + list/test
      - verificação: `cargo check` OK; cliente implementado com `chat_template_kwargs.thinking=false`, `max_tokens=4096`, fallback `reasoning_content`.
      - arquivos: `nvidia_transcription.rs`, Cargo (sem mudança).
- [x] 2. Refatorar settings/provider/backend para NVIDIA (remover OpenRouter)
      - verificação: `cargo check` OK; `cargo test transcription_provider_serializes_as_nvidia` → ok; módulo antigo removido; legados mapeados (openrouter/open_router/gemini → Nvidia).
      - arquivos: settings.rs, actions.rs, transcription.rs, shortcut/mod.rs, lib.rs, model.rs.
- [x] 3. Refatorar frontend/bindings/UI/i18n para NVIDIA
      - verificação: `bun run build` (tsc + vite) OK; nenhuma ref OpenRouter restante fora de pós-processamento/aliases legados.
      - arquivos: bindings.ts, settingsStore.ts, useSettings.ts, ModelsSettings.tsx, modelEntries.ts, ModelRow.tsx, ModelTableRow.tsx, 27 i18n.
- [x] 4. Configurar settings locais e validar chave/modelo com áudio real
      - verificação: `settings_store.json` com provider `nvidia`, modelo `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, chave; testes reais prévios 200 em pt-BR sem 402.
      - arquivos: settings_store.json.
- [x] 5. Compilar, reinstalar (preservando modelos/dados), abrir e validar Caps Lock
      - resultado: release compilado (12m54s), instalado manualmente em `%LOCALAPPDATA%\Programs\Handy` (bundling MSI falhou como sempre), atalho criado, app aberto. Log confirma `transcription_provider: Nvidia`, `transcription_api_keys: {nvidia}`, modelo padrão NVIDIA, `Skipping local model auto-selection because NVIDIA transcription is active`, sem WARN de duplicate field na reabertura. Chave NVIDIA configurada.
      - verificação: `handy.exe` 20/11/2026 22:42:38, app em execução, settings nvidia válidos, modelos/dados preservados.
      - arquivos: artefatos de build; atualização deste plano.

## Notas
- Chave OpenRouter antiga removida de `transcription_api_keys`; restou apenas em `post_process_api_keys` (feature separada de pós-processamento, intencionalmente não alterada).
- Validação final do Caps Lock em tempo real (falar e ver transcrição aparecer) depende do usuário no app; testes de API com áudio real em pt-BR já retornaram 200 com transcrição correta usando a configuração idêntica do cliente.

## Correção pós-instalação: saída em português (pt-BR)
- **Problema reportado:** transcrição saía em **inglês** mesmo falando português.
- **Causa:** com `chat_template_kwargs.thinking=false` (usado para evitar conteúdo vazio), o modelo **traduzia** o áudio para o inglês e perdia precisão.
- **Diagnóstico (teste real com áudio pt-BR):** com **thinking ligado** + `max_tokens=4096` + prompt em português, o `content` veio corretamente em pt-BR e com melhor precisão ("desinstalar o HENGE", "abrir o HENGE"); com thinking off, traduzia ("desistir").
- **Correção aplicada em `nvidia_transcription.rs`:** (1) raciocínio mantido ligado (`chat_template_kwargs: None` — removed o `disable_thinking`); (2) prompt em português do Brasil forçando transcrição exata, sem traduzir/resumir/explicar; (3) `max_tokens` 4096 mantido.
- **Verificação:** teste de API com áudio real em pt-BR → transcrição correta em português; `cargo check` OK. Build de release de correção concluído (13m26s), instalado (handy.exe 20/11/2026 23:01:30), atalho recriado, app aberto com `provider=nvidia`, modelo e chave NVIDIA válidos.

## Rodada 2 (correção definitiva da saída em inglês + dropdown + harness)
- **Problema:** mesmo com prompt PT, a saída ainda vinha em inglês em alguns casos. **Causa raiz:** o `extract_text` tinha um fallback que usava `reasoning_content` (o chain-of-thought do modelo, sempre em inglês) quando `content` vinha vazio — devolvia o raciocínio em inglês como se fosse a transcrição.
- **Correção:** (1) removido o fallback `reasoning_content` e o campo da struct — nunca mais usado como transcrição; (2) `max_tokens` 4096 → **8192** para o `content` nunca ficar vazio; (3) prompt PT mantido; (4) thinking ligado mantido.
- **Dropdown:** antes mostrava só o Nemotron; agora mostra **todos os 33 modelos da chave NVIDIA**, com os que aceitam áudio marcados "(áudio, preferido)" e ordenados primeiro. Teste real: apenas `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` transcreve de fato; os demais aceitam a requisição mas não transcrevem (marcados "(pode não aceitar áudio)").
- **Harness de teste rápido (sem build):** criado `Handy/tools/testar_transcricao.py` — testa modelo/prompt/audio em segundos via API NVIDIA, `--listar` mostra os modelos da chave, documentado no README. Gravação mais recente usada por padrão.
- **Verificação:** harness executado com a gravação mais recente → 200 OK, transcrição em português ("Brasil 1 2 3 tudo da da da não certo..."); `cargo check` OK. Build final de aplicação em andamento.
- **Ferramenta de teste entregue ao usuário:** `Handy/teste_rapido.py` + `Handy/TESTE.bat` (duplo clique). Modos: padrão (transcreve última gravação), `listar` (modelos da chave), `modelo ID` (testa outro modelo). Avisa se vier em inglês. Documentado no README. Testado: 200 OK, "OK: transcricao em portugues".

## Riscos e como detectar
- **Modelo de raciocínio devolver conteúdo vazio:** detectado e mitigado com `thinking:false` + `max_tokens` alto + fallback `reasoning_content`.
- **Chave NVIDIA sem acesso a algum modelo:** listar modelos da chave no startup; dropdown mostra só o que a chave tem.
- **Quebrar migração de settings legados:** teste de migração `openrouter`/`gemini` → `nvidia`.
- **Regressão em onboarding/UI:** não tocar em onboarding; verificar `git diff --name-only`.

## Critérios de aceite
- Nenhuma referência a OpenRouter no código/settings/UI.
- Dropdown mostra apenas modelos NVIDIA disponíveis na chave (todos gratuitos).
- Modelo padrão `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` pré-selecionado/aplicado.
- Caps Lock transcreve via NVIDIA com 200 (sem 402, sem saldo), em pt-BR.
- Botões Verificar e Aplicar funcionando; modelo ativo refletido na lista inferior.
- Nenhuma etapa/onboarding; chave não exposta; modelos/dados preservados.

**GATE:** responda **"OK"** ou **"pode executar"** para eu implementar o plano 010.
