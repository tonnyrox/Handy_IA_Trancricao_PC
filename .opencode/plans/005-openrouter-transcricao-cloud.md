# 005 - Transcrição em nuvem com OpenRouter (substituir/expandir Gemini)

## Contexto e objetivo
O usuário solicitou evoluir a transcrição em nuvem para usar **OpenRouter** (em vez de ficar limitado à Gemini), permitindo informar **apenas a chave da OpenRouter**, escolher o modelo em **dropdown** (com preferência por opções gratuitas/econômicas e suporte a áudio/transcrição quando disponível) e **testar/verificar** a configuração com feedback claro de sucesso/erro.

Estado atual no código (local, não instalado): melhorias do Gemini (plano 004) parcialmente implementadas (dropdown + comandos de listagem/teste + UI/store/bindings/i18n), mas ainda sem build/instalação final desta iteração e com direção alterada pelo usuário.

**Objetivo:** implementar OpenRouter como motor de transcrição em nuvem no Handy (seção **Modelos**), com chave API, seleção de modelo em dropdown e verificação/teste; compilar e reinstalar o app preservando modelos/dados.

## Decisões em aberto (precisam de OK)
- **Escopo do provedor em nuvem:** (A) adicionar **OpenRouter** mantendo **Gemini** como opção, ou (B) **substituir Gemini por OpenRouter** como opção de nuvem (UI mostra Local/OpenRouter e usa apenas chave OpenRouter).  
  - *Recomendação para atender “apenas a chave da OpenRouter”:* **(B)** substituir Gemini por OpenRouter na UI/fluxo de nuvem, simplificando configuração.

## Não-objetivos
- Não remover/alterar o fluxo de transcrição local.
- Não implementar streaming/live preview em nuvem.
- Não garantir que todos os modelos do OpenRouter suportem áudio/transcrição; filtrar/priorizar quando houver metadados e informar erros claros.
- Não implementar múltiplas chaves/provedores além do necessário para a decisão aprovada.

## Decisões técnicas + alternativas descartadas
- **API OpenRouter:** usar `https://openrouter.ai/api/v1` com `Authorization: Bearer <OPENROUTER_API_KEY>` (e headers recomendados como `HTTP-Referer`/`X-Title` se necessário). Listagem via `GET /models`; transcrição/teste via `POST /chat/completions` com modelo multimodal que aceite entrada de áudio (formato de conteúdo de áudio compatível) e prompt de transcrição.
  - *Alternativa descartada:* manter apenas Gemini — limita catálogo/modelos gratuitos conforme pedido.
- **Seleção de modelo:** dropdown populado a partir de `/models`, priorizando modelos gratuitos/econômicos e com indícios de suporte a áudio/multimodal (quando metadados disponíveis), com fallback curado de opções conhecidas para transcrição/áudio.
  - Fallback deve incluir pelo menos opções padrão gratuitas/econômicas viáveis (a definir na implementação conforme metadados reais/compatibilidade) e permitir troca para modelos pagos.
- **Teste/verificação:** botão que valida chave+modelo com chamada real à API (requisição mínima de chat; idealmente validando capacidade de áudio/transcrição quando suportado pelo formato escolhido) e retorna sucesso/erro detalhado (HTTP/status/mensagem sanitizada).
- **Refatoração de configuração:** migrar campos de transcrição em nuvem de `gemini` para `openrouter` (ou estrutura genérica) conforme escopo aprovado, preservando compatibilidade de settings quando possível (migração de chave/modelo antigo se aplicável).
- **Instalação:** fechar app, remover apenas programa (`%LOCALAPPDATA%\Programs\Handy\` + atalho), preservar `%APPDATA%\com.pais.handy\` (modelos/dados/settings) e reinstalar nova versão.

## Arquivos previstos para tocar/criar
- `Handy\.opencode\plans\005-openrouter-transcricao-cloud.md` — este plano.
- `Handy\src-tauri\src\settings.rs` — provider/config OpenRouter (e migração se necessário).
- `Handy\src-tauri\src\openrouter_transcription.rs` (novo) ou refatoração de módulo de nuvem — cliente OpenRouter (listar modelos, transcrever áudio, testar).
- `Handy\src-tauri\src\managers\transcription.rs`, `Handy\src-tauri\src\actions.rs` — roteamento para OpenRouter.
- `Handy\src-tauri\src\shortcut\mod.rs`, `Handy\src-tauri\src\lib.rs` — comandos Tauri (provider/key/model, fetch models, test).
- `Handy\src-tauri\Cargo.toml` (se necessário).
- `Handy\src\bindings.ts`, `Handy\src\stores\settingsStore.ts`, `Handy\src\hooks\useSettings.ts` — contratos/estado/ações.
- `Handy\src\components\settings\models\ModelsSettings.tsx` — UI OpenRouter (chave, dropdown, teste/aplica/verifica, mensagens).
- `Handy\src\i18n\locales\*\translation.json` — strings atualizadas.
- Remoção/ajuste de artefatos Gemini não utilizados conforme escopo aprovado.

## Passos numerados
- [ ] 1. Confirmar escopo (A: Gemini+OpenRouter, B: apenas OpenRouter) e contrato técnico do áudio no OpenRouter
      - resultado: decisão registrada, formato de request/response para transcrição e teste definido, fallback de modelos escolhido.
      - verificação: inspeção de docs/metadados `/models` e validação de formato suportado.
      - arquivos: este plano (atualizado se preciso).

- [ ] 2. Implementar backend OpenRouter (settings, cliente, comandos, integração)
      - resultado: transcrição em nuvem via OpenRouter funcional no fluxo do app com chave+modelo configuráveis.
      - verificação: `cargo check`/build em `src-tauri` (cmake 4.5.1, `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF`).
      - arquivos: Rust em `src-tauri/src/*`.

- [ ] 3. Implementar frontend (dropdown, teste/verificação, persistência)
      - resultado: UI em **Modelos** com chave OpenRouter, dropdown de modelos (default gratuito/econômico) e botão de teste com feedback claro.
      - verificação: `bun run build` em `Handy`.
      - arquivos: `src/*` (componentes, store, hooks, bindings, i18n).

- [ ] 4. Compilar, reinstalar e abrir (preservando modelos/dados)
      - resultado: nova versão instalada em `%LOCALAPPDATA%\Programs\Handy\` com dados/modelos preservados em `%APPDATA%\com.pais.handy\`.
      - verificação: app abre, configurações visíveis, build/instalação concluídos.
      - arquivos: artefatos `src-tauri\target\release\`.

- [ ] 5. Relatar resultado, como configurar/testar e limitações
      - resultado: instruções de uso (chave OpenRouter, escolha de modelo, teste) e notas sobre suporte a áudio por modelo.
      - verificação: resumo entregue.
      - arquivos: nenhum.

## Riscos e como detectar
- **Nem todo modelo OpenRouter aceita áudio:** requisições podem falhar (400/422/unsupported modality). Mitigar filtrando por metadados, oferecendo fallback conhecido e mostrando erro claro no teste/transcrição.
- **Formato de áudio no chat completions variar por modelo/provedor:** detectar em testes reais; ajustar payload (ex.: `input_audio` base64/data URL) conforme compatibilidade.
- **Rate limits/custos em modelos pagos:** defaults gratuitos/econômicos e avisos na UI.
- **Mudança de escopo sobre código Gemini já alterado localmente:** pode exigir refatoração/limpeza; controlar via plano aprovado.

## Critérios de aceite
- Usuário pode configurar **chave OpenRouter** e selecionar **modelo em dropdown** (com opção gratuita/econômica por padrão).
- Existe **verificação/teste** com feedback claro de sucesso/erro.
- Transcrição em nuvem usa OpenRouter quando selecionado e configurado; modo local preservado.
- App reinstalado com nova versão, preservando modelos/dados do usuário.
- Implementação só inicia após OK explícito deste plano e da decisão A/B.
