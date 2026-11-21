# 011 - Integrar Parakeet (Riva gRPC) ao Handy — transcrição PT-BR rápida e precisa

## Contexto
Após investigação completa: a chave NVIDIA `nvapi-...` não tem ASR no gateway HTTP REST, mas o usuário ativou o modelo **`nvidia/parakeet-1_1b-rnnt-multilingual-asr`** em build.nvidia.com e forneceu o function-id (guardado localmente em `.env` / `settings_store.json`, não no código). Teste real via gRPC (`grpc.nvcf.nvidia.com:443`) com `--language-code pt-BR` transcreveu áudio em português do Brasil com **perfeição, rapidez e sem erro 402/saldo**.

Resultado do teste (áudio real):
> "você vai fazer assim agora você vai desinstalar o range que tá instalado no meu computador agora e você vai instalar essa nova versão já arrumada tudo perfeitamente..."

## Anti-requisitos
- ❌ Não usar mais o Nemotron omni (lento/impreciso) como engine cloud.
- ❌ Não expor chave/function-id em logs ou mensagens.
- ❌ Não reintroduzir onboarding/etapas.
- ❌ Não mexer em modelos baixados/dados do usuário.
- ❌ Não pedir saldo/crédito.

## Decisões técnicas
- Substituir o backend de transcrição cloud: de `nvidia_transcription.rs` (chat HTTP omni) para **Riva gRPC** (`nvidia/parakeet-1_1b-rnnt-multilingual-asr` via `grpc.nvcf.nvidia.com:443`, metadata `function-id` + `authorization`, `language-code=pt-BR`).
- Rust: usar `tonic` + os protos do Riva (ou cliente gRPC gerado). Alternativa: embedar um binário/Python? NÃO — preferir gRPC nativo em Rust.
  - Verificar se `tonic`/`prost` já estão no Cargo.toml; se não, adicionar.
  - Protos do Riva: `nvidia_riva::riva::asr` (pacote `riva-asr`?). Baixar/generar via `tonic-build` ou usar crate existente.
- settings: manter `transcription_api_keys["nvidia"]` = chave; adicionar campo `nvidia_asr_function_id` (default = o function-id fornecido). Modelo padrão: `parakeet-1_1b-rnnt-multilingual-asr`.
- Comandos: `test_nvidia_transcription` agora testa via gRPC (avaliação rápida, sem 402); `fetch_nvidia_transcription_models` lista modelos da chave + o ASR ativado.
- UI: dropdown mostra o Parakeet como modelo preferido/áudio; "Verificar"/"Aplicar" continuam.
- `teste_rapido.py` / `teste_mic.py`: atualizar para usar gRPC via `nvidia-riva-client` (já instalado no venv) com o function-id, em vez do chat omni.

## Arquivos previstos
- `src-tauri/Cargo.toml` — adicionar `tonic`, `prost`, `tonic-build` (build-deps) se necessário.
- `src-tauri/build.rs` (ou existente) — compilar protos do Riva (`asr.proto`).
- `src-tauri/src/nvidia_transcription.rs` — reescrever cliente para gRPC Riva (Synthesize? não — Recognize/StreamingRecognize), `language-code=pt-BR`.
- `src-tauri/src/settings.rs` — campo `nvidia_asr_function_id`, default do function-id, modelo padrão Parakeet, helper `is_nvidia_transcription_configured`.
- `src-tauri/src/shortcut/mod.rs` — comandos atualizados.
- `src/bindings.ts`, `settingsStore.ts`, `useSettings.ts`, `ModelsSettings.tsx`, `modelEntries.ts`, i18n — ajustes mínimos.
- `teste_rapido.py`, `teste_mic.py` — usar gRPC Riva com function-id (teste sem build).
- `settings_store.json` — chave NVIDIA + function-id + modelo Parakeet.

## Passos numerados
- [x] 1. Validar gRPC Riva em Rust (tonic + protos) — prova feita com teste ao vivo.
      - verificação: `cargo test --test riva_live -- --nocapture` passou em 3s com transcrição PT-BR perfeita de áudio real. Correção necessária: `.with_native_roots()` no `ClientTlsConfig` (o `tls-native-roots` feature sozinho não bastava; sem isso dava `UnknownIssuer`). Teste temporário removido após validação.
- [x] 2. Reescrever cliente de transcrição para gRPC (`language-code=pt-BR`, metadata function-id + bearer).
      - verificação: teste ao vivo passou (3s, PT-BR perfeito); roteamento em `transcription.rs` trocado para `nvidia_riva::transcribe_audio_blocking`.
- [x] 3. Atualizar settings/defaults/comandos/bindings/UI (Parakeet, function-id).
      - verificação: `bun run build` + `cargo check` OK; `nvidia_asr_function_id` nas settings, comando `change_nvidia_asr_function_id_setting`, `test_nvidia_transcription` via Riva.
- [x] 4. Atualizar harness de teste rápido (gRPC via nvidia-riva-client) com function-id.
      - verificação: `riva_asr.py` + `teste_rapido.py` + `teste_mic.py` transcrevem PT-BR corretamente (validação anterior no painel).
- [x] 5. Configurar settings_store.json, compilar release, instalar, abrir, validar Caps Lock.
      - resultado: release compilado (12m42s), instalado em `%LOCALAPPDATA%\Programs\Handy` (handy.exe 21/11/2026 00:27:27), atalho recriado, app aberto. Log confirma `transcription_provider: Nvidia`, modelo parakeet, function-id, chave nvidia, sem WARN de duplicate. Modelos/dados preservados.
      - verificação: teste ao vivo Riva (3s, PT-BR perfeito) + log de startup. Validação final do Caps Lock em tempo real fica com o usuário no app.

## Riscos
- **Protos Riva em Rust:** se `tonic` for pesado, usar `grpcio`? (Rust prefere tonic). Baixar `.proto` do repo nvidia-riva.
- **Function-id/chave expostos:** nunca logar valores.
- **Latência:** gRPC streaming é rápido (~1-2s), validado no teste Python.

## Critérios de aceite
- Caps Lock transcreve PT-BR rápido (segundos) e com qualidade, via Parakeet gRPC.
- Nenhum erro 402 / saldo.
- Nenhuma etapa/onboarding. Modelos/dados preservados.
- Harness de teste rápido funciona com gRPC e function-id.

**GATE:** responda **"OK"** ou **"pode executar"** para eu implementar o plano 011.
