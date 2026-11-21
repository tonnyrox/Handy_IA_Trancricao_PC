# 007 - Remover onboarding/etapas e corrigir OpenRouter

## Contexto e objetivo
O usuário reportou dois problemas críticos:
1. **Onboarding/etapas iniciais indesejadas:** ao abrir o app aparecem várias etapas (1-5, "experimente", seleção/configuração guiada). O usuário quer remover **todas** essas etapas e abrir direto no programa/menu principal para configurar manualmente. Pedido explícito para remoção permanente do fluxo no código.
2. **OpenRouter com falhas/inconsistências:** erro/falha na API percebida, modelo não permanecendo selecionado/aplicado/ativo corretamente em outras áreas. Há indício de que no startup o app reverte provider para Local e restaura um modelo local selecionado, desfazendo o estado aplicado do OpenRouter.

Objetivo: abrir direto no app (sem onboarding), e deixar OpenRouter funcional e consistente (verificar/aplicar, manter provider/modelo/chave, refletir modelo ativo corretamente, sem reversão indevida no startup).

## Não-objetivos
- Não reintroduzir fluxo de entrada por etapas.
- Não alterar funcionalidades não relacionadas além do mínimo necessário para remover onboarding e estabilizar OpenRouter/model selection.
- Não expor segredos/chaves em logs ou mensagens.

## Diagnóstico (evidências)
- `App.tsx` direciona para `OnboardingFlow` quando `onboarding_completed` é falso e para telas de permissões/migração em alguns casos de retorno; há componentes completos em `src/components/onboarding/*`.
- `src-tauri/src/managers/model.rs:auto_select_model_if_needed` auto-seleciona um modelo local baixado quando `onboarding_completed` é true e `selected_model` está vazio. Com provider OpenRouter (sem modelo local selecionado), isso restaura `selected_model` local no startup e contribui para inconsistência de estado.
- Na instalação atual, após abrir o app, `settings_store.json` foi observado com provider revertido para `local` e `selected_model` local restaurado (chave OpenRouter preservada em uma das tentativas), o que faz a UI não manter o modelo OpenRouter como ativo/aplicado.

## Decisões técnicas + alternativas descartadas
- **Acesso direto ao app:** fazer `App.tsx` iniciar sempre na interface principal (`done`), removendo o uso de `OnboardingFlow` e telas de onboarding de bloqueio. Remover código/componentes de onboarding não utilizados e referências/command (`complete_onboarding`) para evitar reativação e manter o código limpo (remoção permanente solicitada).
  - *Alternativa descartada:* apenas marcar `onboarding_completed=true` e manter telas/código — não atende "remover todas as etapas/remover do código permanentemente".
- **Seleção automática compatível com OpenRouter:** em `auto_select_model_if_needed`, não auto-selecionar modelo local quando `transcription_provider == OpenRouter` (e/ou OpenRouter estiver ativo/configurado para uso em nuvem), evitando sobrescrever estado de nuvem no startup. Manter auto-seleção para modo local quando apropriado.
- **Consistência de estado OpenRouter:** garantir que aplicar OpenRouter mantenha provider/modelo/chave persistidos, limpe modelo local, e que a UI reflita corretamente o modelo aplicado. Revisar pontos que possam forçar provider/local indevidamente.
- **Validação:** testar chave/modelo OpenRouter via backend/API (`testOpenRouterTranscription`/config real) sem expor chave; validar build e comportamento na UI instalada.

## Arquivos previstos para tocar/remover
- `Handy/src/App.tsx` — remover fluxo de onboarding/etapas e ir direto ao app; limpar imports/handlers relacionados.
- `Handy/src/components/onboarding/*` — remover componentes/estilos/store/utilitários de onboarding não mais usados (inclui `OnboardingFlow`, telas, `onboardingStore`, transições, etc.), conforme referências.
- `Handy/src/components/settings/debug/OnboardingPreview.tsx` e referências em `DebugSettings`/bindings/UI — remover ou ajustar para não depender de onboarding removido.
- `Handy/src/bindings.ts` — remover `completeOnboarding` se comando for removido.
- `Handy/src-tauri/src/shortcut/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/*` (se aplicável) — remover comando `complete_onboarding` e registro/referências.
- `Handy/src-tauri/src/managers/model.rs` — ajustar `auto_select_model_if_needed` para não forçar modelo local quando provider OpenRouter estiver ativo.
- `Handy/src-tauri/src/settings.rs` (se necessário) — ajustes mínimos de migração/comportamento para não reintroduzir bloqueios de onboarding (sem quebrar stores existentes).
- `Handy/src/components/settings/models/*`, stores/hooks relacionados — correções pontuais de consistência OpenRouter se necessário.
- `Handy/.opencode/plans/007-remover-onboarding-e-corrigir-openrouter.md` — este plano.

## Passos numerados
- [x] 1. Mapear referências de onboarding e fluxo de startup
      - resultado: mapeados `App.tsx`, `components/onboarding/*`, `DebugSettings/OnboardingPreview`, `complete_onboarding`, `auto_select_model_if_needed` e migrações de settings.
      - verificação: inspeção de frontend/backend/bindings.
      - arquivos: leitura/análise.

- [x] 2. Remover onboarding/etapas e abrir direto no app
      - resultado: `App.tsx` abre direto na UI principal; removidos `components/onboarding/*` e preview de onboarding; `DebugSettings` simplificado; `complete_onboarding` removido de backend/bindings/registro.
      - verificação: `bun run build` OK.
      - arquivos: `App.tsx`, `components/settings/debug/DebugSettings.tsx`, remoção de onboarding, `commands/mod.rs`, `lib.rs`, `bindings.ts`.

- [x] 3. Corrigir persistência/seleção OpenRouter no startup e estado
      - resultado: `auto_select_model_if_needed` não auto-seleciona modelo local quando provider é OpenRouter; migração de settings força `onboarding_completed=true` para evitar estado pendente; manter Aplicar/Verificar e reflexo do modelo OpenRouter na UI.
      - verificação: `cargo check` OK.
      - arquivos: `managers/model.rs`, `settings.rs`.

- [x] 4. Testar chave/modelo OpenRouter e validar integração
      - resultado: teste API OpenRouter com a chave configurada retornou sucesso (`API_TEST_OK`).
      - verificação: chamada direta à API OpenRouter (sem expor chave).
      - arquivos: nenhum (validação).

- [x] 5. Compilar, reinstalar (preservando modelos/dados) e validar app aberto
      - resultado: release compilado (11m20s), instalado manualmente em `%LOCALAPPDATA%\Programs\Handy` (bundling MSI falhou), atalho criado e app aberto.
      - verificação: `handy.exe` atualizado (20/11/2026 21:08), app em execução, `%APPDATA%\com.pais.handy\models` preservado; settings após abertura com `provider=openrouter`, modelo configurado, chave presente, `selected_model` vazio, `onboarding_completed=true`.
      - arquivos: artefatos de build/instalação.

- [x] 6. Relatar resultado e limitações
      - resultado: onboarding/etapas removidos (abertura direta), correções de OpenRouter/startup aplicadas, chave testada com sucesso; nova versão instalada e aberta.
      - verificação: checklist atendido tecnicamente; recomendada confirmação visual final em Configurações > Modelos (Verificar/Aplicar).
      - arquivos: atualização deste plano.

## Riscos e como detectar
- **Remoção ampla quebrar imports/build ou debug tools:** detectar com `bun run build`/`cargo check`; mitigar removendo referências em cascata.
- **Usuários sem modelo local selecionado (modo Local):** auto-seleção pode ser necessária em alguns casos; ajustar regra para não afetar Local indevidamente.
- **Migrações de settings legadas:** alterar com cuidado para não corromper stores existentes; preservar campos desconhecidos.
- **App aberto sobrescrever settings durante testes:** parar processo antes de editar `settings_store.json`.

## Critérios de aceite
- Ao abrir o Handy, **não há etapas de onboarding** (1-5, "experimente", etc.); abre direto no programa/menu.
- Código/fluxo de onboarding removido/desativado permanentemente conforme solicitado (sem telas de etapas).
- OpenRouter: chave/modelo podem ser verificados e aplicados; ao aplicar, modelo OpenRouter fica ativo/refletido na lista e modelo local desmarcado.
- Provider/modelo OpenRouter aplicado não é revertido indevidamente no startup pela auto-seleção local.
- Build nova instalada (programa apenas), atalho criado, app aberto, **modelos/dados preservados**.
- Nenhuma implementação antes de aprovação explícita ("OK"/"pode executar") deste plano.
