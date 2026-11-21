# 006 - OpenRouter: botão Aplicar, refletir modelo ativo na lista e ajustes de UI

## Contexto e objetivo
A versão instalada com OpenRouter (plano 005) foi rejeitada pelo usuário por problemas de UX/comportamento:
- falta botão **Aplicar** para confirmar/aplicar o modelo OpenRouter selecionado;
- ao aplicar, o modelo local ativo na lista inferior (**Modelos** / busca/lista de modelos) deve ser desmarcado e o **modelo OpenRouter selecionado deve aparecer como ativo** nessa área (modelo especial de nuvem);
- remover qualquer comportamento de "entrada por etapas/passo a passo" adicionado indevidamente; manter o padrão anterior da tela, alterando apenas o que foi solicitado para OpenRouter na tela de **Modelos**;
- garantir fluxo completo: selecionar modelo, **Verificar**, **Aplicar** e refletir corretamente o estado ativo.

## Não-objetivos
- Não alterar telas de onboarding/fluxo de entrada do app (não modificar `onboarding/*`).
- Não alterar funcionalidades fora do escopo solicitado (exceto o mínimo necessário para aplicar/limpar seleção de modelo corretamente).
- Não remover suporte a OpenRouter, dropdown, verificação ou preservação de dados/modelos.

## Decisões técnicas + alternativas descartadas
- **Aplicar explícito:** adicionar botão **Aplicar** na configuração OpenRouter (Modelos). Ao clicar: persistir chave (se alterada) e modelo selecionado, definir provider como `openrouter`, limpar seleção de modelo local ativo e atualizar UI para refletir o modelo OpenRouter aplicado.
  - *Alternativa descartada:* aplicar automaticamente ao selecionar no dropdown sem ação explícita — não atende ao pedido de botão Aplicar.
- **Modelo ativo na lista inferior:** quando OpenRouter estiver aplicado/ativo, exibir uma entrada especial (ex.: `OpenRouter: <modelo>`) como ativa na seção/lista de modelos (área inferior), sem marcar nenhum modelo local como ativo.
  - Implementar como entrada sintética/virtual na UI (e tratamento em `modelEntries`/renderização) para não depender de download local; ações de download/delete não se aplicam.
- **Limpeza de seleção local:** adicionar suporte backend/frontend para limpar o modelo local ativo (`selected_model` vazio) quando OpenRouter for aplicado, mantendo estado consistente (settings/model store/transcription manager conforme necessário).
- **UI sem passo a passo:** manter layout simples e direto na seção OpenRouter (chave, dropdown, Verificar, Aplicar, feedback) sem wizard/etapas adicionais.

## Arquivos previstos para tocar/criar
- `Handy\.opencode\plans\006-openrouter-aplicar-e-ajustes-ui.md` — este plano.
- `Handy\src\components\settings\models\ModelsSettings.tsx` — UI OpenRouter (botão Aplicar, fluxo de aplicar/verificar, exibição do modelo ativo).
- `Handy\src\components\settings\models\modelEntries.ts` (e possivelmente `ModelRow.tsx`) — entrada sintética/estado para modelo OpenRouter ativo e remoção de seleção local na lista.
- `Handy\src\stores\settingsStore.ts`, `Handy\src\hooks\useSettings.ts` — ações de aplicar/limpar estado conforme necessário.
- `Handy\src\stores\modelStore.ts` — sincronização de modelo local ativo (limpar quando OpenRouter aplicado).
- `Handy\src\bindings.ts` e comandos Rust (`src-tauri/src/commands/models.rs`, `src-tauri/src/shortcut/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/managers/transcription.rs` se necessário) — comando/fluxo para limpar seleção local ao aplicar nuvem.
- `Handy\src\i18n\locales\*\translation.json` — strings para "Aplicar" e rótulo do modelo OpenRouter ativo (se necessário).

## Passos numerados
- [x] 1. Mapear fluxo atual de seleção/aplicação e exibição ativa
      - resultado: identificado contrato: Aplicar persiste provider/chave/modelo OpenRouter, limpa `selected_model` local e UI exibe entrada sintética ativa de nuvem quando provider=openrouter.
      - verificação: inspeção de `ModelsSettings`, `modelEntries`, `ModelRow`, stores e comandos Rust.
      - arquivos: leitura/análise.

- [x] 2. Implementar "Aplicar" e limpeza de seleção local
      - resultado: botão Aplicar implementado; comando backend `clear_active_model` adicionado/registrado; frontend limpa estado local e recarrega modelo atual.
      - verificação: `bun run build` OK; `cargo check` (src-tauri) concluído com sucesso (warnings pré-existentes).
      - arquivos: `src-tauri/src/commands/models.rs`, `src-tauri/src/lib.rs`, `src/bindings.ts`, `ModelsSettings.tsx`, stores/model entries.

- [x] 3. Exibir modelo OpenRouter aplicado na lista inferior e ajustar UI
      - resultado: entrada sintética `OpenRouter: <modelo>` ativa na lista inferior quando provider OpenRouter; modelos locais desmarcados; sem ações de download/delete na entrada de nuvem; sem alterações em onboarding.
      - verificação: `bun run build` OK; revisão de `ModelsSettings.tsx`, `modelEntries.ts`, `ModelRow.tsx`, `ModelTableRow.tsx`.
      - arquivos: UI/model entries/row/shared row.

- [x] 4. Fechar, desinstalar programa, compilar e reinstalar (preservando modelos/dados)
      - resultado: app desinstalado (somente programa), release compilado (13m23s; bundling MSI falhou como esperado), instalado manualmente com atalho e aberto; modelos/dados preservados.
      - verificação: `handy.exe` atualizado em `%LOCALAPPDATA%\Programs\Handy%` (20/11/2026), atalho `Handy.lnk` criado, app em execução; `%APPDATA%\com.pais.handy\models` intacto.
      - arquivos: artefatos de build/instalação.

- [x] 5. Validar comportamento solicitado e relatar
      - resultado: correções implementadas para Verificar/Aplicar e reflexão do modelo OpenRouter na lista inferior com modelo local desmarcado; nenhuma alteração em onboarding; build instalado e aberto para validação na UI.
      - verificação: checagens de build/instalação e configuração preservada; validação final de interação na UI solicitada ao usuário.
      - arquivos: nenhum (relatório).

## Riscos e como detectar
- **Estado inconsistente entre `selected_model` local e provider OpenRouter:** detectar ao alternar entre local/nuvem; mitigar limpando/carregando estados explicitamente.
- **Entrada sintética quebrar ações da tabela (download/delete/seleção):** detectar em interação; mitigar tratando id especial como não-interativo/não-baixável.
- **Alterações acidentais em onboarding:** evitar não tocando arquivos de onboarding; verificar `git diff --name-only`.

## Critérios de aceite
- Existe botão **Aplicar** para o modelo OpenRouter selecionado.
- Ao **Aplicar**, o modelo local ativo na lista inferior é desmarcado e o modelo OpenRouter aplicado aparece como ativo nessa área.
- Botão **Verificar** continua validando chave+modelo com feedback claro.
- Nenhuma tela/fluxo de "entrada por etapas" de onboarding foi adicionado/modificado.
- Nova versão compilada e reinstalada, com modelos/dados preservados e app aberto.
- Nenhuma implementação iniciada antes de aprovação explícita ("OK"/"pode executar") deste plano.
