# 013 - Organização visual da tela de Modelos (layout, seções e rolagem)

## Pedido do usuário (resumo)
Arrumar a **aparência/layout ("layout"sic)** da tela de Modelos, que está bagunçada:
1. **Bloco da API (chave/engine) mais bonito, atraente e organizado** — com a escolha clara entre **Local** e **NVIDIA Cloud**, chave API, botões organizados.
2. **Separar modelo local do modelo cloud** — hoje aparecem dois modelos "abaixo" misturados; o modelo NVIDIA deve ficar em uma **seção própria**, distinta dos modelos locais.
3. **Function-ID oculto para o usuário comum** — só a chave API deve aparecer; o function-id vai para uma área "Avançado" (recolhida), mas continua editável.
4. **Dropdown sem textos duvidosos** — remover "(pode não aceitar áudio)". Só mostrar modelos com **certeza** de que funcionam (após "Verificar modelos"). Sim ou não, sem "talvez".
5. **Barra de rolagem visível** — não dá para descer e ver os modelos (crítico).
6. Botões/chave: poder **remover/trocar a chave** de forma clara (já existe, mas o visual está confuso).

## Diagnóstico (investigação feita antes do plano)
- `ModelsSettings.tsx`: o bloco NVIDIA usa `SettingContainer` com vários `inputs` empilhados e três pares de botões — visualmente denso e sem hierarquia.
- `modelEntries.ts`: o modelo cloud (`NVIDIA_CLOUD_MODEL_ID`) entra em `yours.unshift(...)`, ou seja, **misturado com os modelos locais** na mesma seção "Seus modelos".
- `nvidia_transcription.rs::list_models`: modelos não-testados recebem label `"(pode não aceitar áudio)"` — texto duvidoso que o usuário rejeitou.
- `ModelTable.tsx` linha ~344: a lista usa `[scrollbar-width:none] [&::-webkit-scrollbar]:hidden` — **barra de rolagem escondida de propósito** ( há um `ScrollThumb` overlay, mas não é suficiente/visível para o usuário).

## Plano simplificado (passos)

- [ ] 1. **Novo bloco visual da API (engine + chave)**
      - Card de seleção de motor: **Local (no dispositivo)** vs **NVIDIA Cloud (API)** com destaque visual no ativo.
      - Chave NVIDIA em campo visível com botão de **limpar/remover** e de **mostrar/ocultar** (olho).
      - Function-ID movido para um painel **"Avançado (opcional)"** recolhido por padrão — editável, mas fora do caminho normal.
      - Botões organizados em uma linha: **Verificar configuração** · **Verificar modelos** · **Aplicar**.
      - arquivos: `ModelsSettings.tsx`, i18n.

- [ ] 2. **Separar modelo cloud do local na lista inferior**
      - Criar seção própria no topo da tabela: **"Modelo em uso (NVIDIA Cloud)"** com o modelo aplicado.
      - Modelos baixados locais ficam apenas em **"Seus modelos"** (sem o cloud misturado).
      - arquivos: `modelEntries.ts`, `ModelsSettings.tsx`, i18n.

- [ ] 3. **Dropdown só com certezas**
      - Remover o sufixo `"(pode não aceitar áudio)"`.
      - Antes da checagem: mostrar só o Parakeet (padrão, conhecido) — ou lista vazia com dica para clicar "Verificar modelos".
      - Depois da checagem: mostrar **apenas os que passaram no teste** (já implementado no store; só ajustar o fallback Em `list_models`).
      - arquivos: `nvidia_transcription.rs`, `settingsStore.ts`.

- [ ] 4. **Barra de rolagem visível**
      - Remover as classes que escondem a scrollbar em `ModelTable.tsx`.
      - Garantir que o painel inteiro (bloco da API + tabela) tenha rolagem quando a janela for pequena.
      - arquivos: `ModelTable.tsx`, `App.tsx` (se necessário).

- [ ] 5. **Validação + build + instalação**
      - `cargo check` + `bun run build`; build release, instalar, abrir.
      - arquivos: artefatos.

## Critérios de aceite
- Tela de Modelos com hierarquia visual clara (motor → chave → botões → modelos).
- Modelo NVIDIA em seção separada; locais em "Seus modelos".
- Function-id escondido em "Avançado" (mas editável).
- Nenhum label "pode não aceitar áudio" — só modelos com teste positivo.
- Barra de rolagem visível e funcional na lista de modelos.
- Chave removível/trocável pelo app.

**GATE:** responder **"OK"** ou **"pode executar"** para eu implementar.
