# 004 - Gemini: dropdown de modelos e verificação/teste

## Contexto e objetivo
A integração Gemini (plano 003) já permite selecionar o motor Gemini, informar API key e modelo em texto livre na seção **Modelos**. O usuário solicitou melhorias de UX e confiabilidade:
- selecionar o modelo Gemini por **dropdown** (não campo de texto livre), listando modelos disponíveis (ex.: ~5 opções);
- manter padrão em modelo **gratuito/econômico** por padrão, permitindo trocar para modelos pagos;
- adicionar **botão de verificação/teste** para validar chave+modelo e informar claramente sucesso/erro (aplicar/testar/verificar antes de confiar na configuração).

**Objetivo:** implementar essas melhorias no backend/frontend e, após aprovação, compilar, reinstalar o app (somente programa, preservando modelos/dados) e abrir para teste.

## Não-objetivos
- Não remover/alterar o fluxo de transcrição local.
- Não implementar streaming/live preview em nuvem.
- Não alterar pós-processamento LLM.
- Não implementar seleção automática avançada de modelo por preço/cota além de heurística simples (priorizar modelos econômicos/flash no topo e fallback padrão).
- Não garantir cobertura de todos os modelos/contas Gemini; tratar erros da API com mensagens claras.

## Decisões técnicas + alternativas descartadas
- **Listagem de modelos Gemini:** novo comando Tauri (ex.: `fetch_gemini_transcription_models`) que consulta `GET https://generativelanguage.googleapis.com/v1beta/models` com `x-goog-api-key` (quando houver chave informada) e retorna modelos que suportam `generateContent`, priorizando opções econômicas/flash (ex.: `gemini-2.0-flash`, `gemini-1.5-flash`/variantes disponíveis) para exibição no dropdown.
  - *Alternativa descartada:* lista totalmente estática — não reflete modelos disponíveis na conta/região; manteremos fallback estático/curado quando a listagem falhar ou não houver chave.
- **Fallback e padrão econômico:** manter default `gemini-2.0-flash` (ou equivalente econômico disponível) e garantir que o dropdown sempre ofereça opções utilizáveis (fallback inclui modelos comuns como `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`, e outros econômicos quando aplicável).
  - Se o modelo salvo não estiver na lista carregada, exibir como opção selecionada/compatível para não perder configuração existente.
- **Verificação/teste:** novo comando Tauri (ex.: `test_gemini_transcription_config`) que valida chave+modelo com uma chamada leve de `generateContent` (prompt textual curto, sem áudio) e retorna sucesso ou erro detalhado/sanitizado.
  - *Alternativa descartada:* teste transcrevendo áudio real gravado pelo usuário — depende de microfone/fluxo completo; botão explícito deve dar feedback imediato da configuração. (Teste real de transcrição continua possível ao gravar após configurar.)
  - *Alternativa descartada:* apenas verificar formato da chave — insuficiente para confirmar acesso/modelo.
- **UX "aplica/testa/verifica":** na UI Gemini, manter persistência das configurações (API key/modelo) e adicionar botão **Verificar/Testar** que executa o teste com os valores atuais (salvos/draft conforme implementação) e mostra estado: testando, sucesso, erro com mensagem. Seleção de modelo via dropdown atualiza configuração; botão deixa claro o resultado da verificação.
- **Bindings:** atualizar `src/bindings.ts` e tipos/frontend para novos comandos e resultados; regenerar/ajustar conforme padrão do projeto.
- **Reinstalação:** fechar Handy, remover apenas instalação do programa (`%LOCALAPPDATA%\Programs\Handy\` e atalho desktop), preservar `%APPDATA%\com.pais.handy\` (modelos, settings, histórico) e `%LOCALAPPDATA%\com.pais.handy\` (cache). Instalar nova versão (bundle se disponível; senão cópia manual de `target\release\handy.exe`, DLLs e `resources`).

## Arquivos previstos para tocar/criar (caminho exato)
- `Handy\.opencode\plans\004-gemini-modelo-dropdown-e-teste.md` — este plano (status).
- `Handy\src-tauri\src\gemini_transcription.rs` — listar modelos Gemini, helper de teste/validação de chave+modelo, parsing/erros.
- `Handy\src-tauri\src\shortcut\mod.rs` — comandos Tauri para buscar modelos Gemini e testar configuração.
- `Handy\src-tauri\src\lib.rs` — registrar novos comandos/módulos.
- `Handy\src\bindings.ts` — tipos/chamadas dos novos comandos.
- `Handy\src\stores\settingsStore.ts` — ações/estado para fetch/test Gemini (e atualização de modelo via dropdown).
- `Handy\src\hooks\useSettings.ts` — expor helpers Gemini ao frontend.
- `Handy\src\components\settings\models\ModelsSettings.tsx` — dropdown de modelos, botão de verificação/teste, estados de loading/sucesso/erro, UX de aplicar/testar.
- `Handy\src\i18n\locales\en\translation.json` e demais `Handy\src\i18n\locales\*\translation.json` — strings da nova UI (dropdown, teste, mensagens de status/erro).

## Passos numerados

- [ ] 1. Baseline e desenho final da UX/contratos
      - resultado: confirmar contratos dos novos comandos (input/output), estratégia de fallback de modelos, texto de feedback e comportamento do botão (testar/aplicar/verificar).
      - verificação: inspeção do código atual (Gemini settings/commands/UI/store/bindings) e definição explícita neste plano antes de editar.
      - arquivos: leitura/análise; ajustes mínimos neste plano se necessário.

- [ ] 2. Backend Gemini: listagem de modelos e teste de configuração
      - resultado: implementar listagem de modelos via API Gemini (com filtro/priorização econômica e fallback) e comando de teste de chave+modelo com retorno claro de sucesso/erro.
      - verificação: `cargo check` em `Handy\src-tauri` (ambiente com `<casa-do-usuario>\.cargo\bin\cargo.exe`, CMake 4.5.1 no PATH, `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF`) sem erros novos dos módulos alterados; revisão de tratamento de erros/segredos (sem logar chave).
      - arquivos: `src-tauri/src/gemini_transcription.rs`, `src-tauri/src/shortcut/mod.rs`, `src-tauri/src/lib.rs` (e tipos auxiliares se necessário).

- [ ] 3. Frontend/store/bindings: dropdown e fluxo de verificação
      - resultado: UI Gemini em **Modelos** com dropdown de modelos (default econômico), carregamento de opções, seleção persistida e botão de verificar/testar com feedback de sucesso/erro; estado/ações integrados.
      - verificação: `bun run build` em `Handy` conclui com sucesso; revisão manual do fluxo (sem chave, com chave inválida simulada por erro retornado, com sucesso).
      - arquivos: `src/components/settings/models/ModelsSettings.tsx`, `src/stores/settingsStore.ts`, `src/hooks/useSettings.ts`, `src/bindings.ts`, `src/i18n/locales/*/translation.json`.

- [ ] 4. Build da nova versão e instalação limpa do programa (preservando modelos)
      - resultado: Handy fechado, apenas programa desinstalado (`%LOCALAPPDATA%\Programs\Handy\` + atalho), nova versão compilada e instalada; app aberto para configuração/teste.
      - verificação: build release concluído (ou bundle falha documentada com instalação manual bem-sucedida), `handy.exe` atualizado em execução, e `%APPDATA%\com.pais.handy\models` intacto.
      - arquivos: artefatos em `src-tauri\target\release\` e instalação em `%LOCALAPPDATA%\Programs\Handy\`.

- [ ] 5. Relatar resultado e pendências de teste do usuário
      - resultado: resumo do que foi alterado, como testar (dropdown, modelo econômico padrão, troca para pago, botão verificar) e eventuais limitações.
      - verificação: instruções claras entregues ao usuário.
      - arquivos: nenhum (relatório).

## Riscos e como detectar
- **Endpoint/resposta de listagem de modelos Gemini variar:** detectar por erro de fetch/parsing; mitigar com fallback de lista curada e mensagem clara.
- **Teste de verificação dar falso negativo/positivo conforme prompt/modelo:** detectar em testes manuais; usar chamada simples e tratar respostas/erros HTTP explicitamente.
- **Bindings dessincronizados:** detectar por erros de TypeScript/build; atualizar `bindings.ts` e assinaturas.
- **Build/bundle Windows falhar (assinatura/tooling):** detectar no log do `tauri build`; mitigar com instalação manual do binário/DLLs/resources (como feito anteriormente), preservando dados.
- **Perda de dados/modelos na reinstalação:** evitar removendo apenas `%LOCALAPPDATA%\Programs\Handy` e atalho; **não** apagar `%APPDATA%\com.pais.handy`.

## Critérios de aceite
- Campo de modelo Gemini na seção **Modelos** é um **dropdown** com modelos disponíveis (com opções padrão/econômicas visíveis) e permite selecionar modelos pagos.
- Modelo padrão inicial é econômico/gratuito (ex.: `gemini-2.0-flash`), com opção de troca.
- Existe ação de **verificação/teste** da configuração Gemini que retorna feedback claro de sucesso ou erro ao usuário.
- Nova versão compilada e instalada (programa reinstalado) com modelos/dados do usuário preservados; app aberto para teste.
- Nenhuma implementação iniciada antes de aprovação explícita ("OK"/"pode executar") deste plano.
