# Índice da documentação — Handy fork PT-BR (tema azul)

Este arquivo é o **ponto de entrada**. Aqui está everything que importa e onde está.
Atualizado em 23/11/2026 (data dos commits). Revisado em 24/11/2026.

## 1. Arquivo mestre (comece aqui)

| Arquivo | O que contém |
|---|---|
| **`MELHORIAS_TRANSCRICAO_PTBR.md`** | Diagnóstico, decisões, plano de melhorias e estado atual da transcrição PT-BR. É o documento vivo do projeto — **toda melhoria vai para cá**. Tem 15 seções + apêndice consolidado. **A seção 13 (PENTIFINO) prevalece sobre as anteriores; a 14 consolida as três análises externas; a 15 planeja a unificação de provedores e a organização da aba Modelos.** |

## 2. Documentação do fork (aplicável ao nosso sistema)

| Arquivo | O que contém | Status |
|---|---|---|
| `README.md` | Visão geral do fork, instalação, créditos | ✅ atualizado |
| `MELHORIAS_TRANSCRICAO_PTBR.md` | Plano mestre (seção 1) | ✅ vivo |
| `.opencode/plans/010-trocar-openrouter-por-nvidia.md` | Histórico: troca OpenRouter → NVIDIA | 📦 arquivado (resumo no apêndice) |
| `.opencode/plans/011-parakeet-grpc-ptbr.md` | Histórico: Riva gRPC / Parakeet PT-BR | 📦 arquivado (resumo no apêndice) |
| `.opencode/plans/012-chave-modelos-e-qualidade.md` | Histórico: chave, modelos, qualidade | 📦 arquivado (resumo no apêndice) |
| `.opencode/plans/013-organizacao-visual-modelos.md` | Histórico: layout da tela de Modelos | 📦 arquivado (resumo no apêndice) |

## 3. Referência técnica do upstream (mantida, mas NÃO é instrução do fork)

Estes arquivos vieram do Handy original (`cjpais/Handy`). Servem de referência técnica, mas **não devem ser seguidos como instruções do nosso fork** — o fork tem regras próprias no `MELHORIAS_TRANSCRICAO_PTBR.md`.

| Arquivo | Natureza |
|---|---|
| `AGENTS.md` | Arquitetura e padrões do código (útil) + regras de PR/issue do upstream (ignorar) |
| `BUILD.md` | Pré-requisitos de build por plataforma (útil) |
| `CONTRIBUTING.md` | Processo de contribuição do upstream — **ignorar** |
| `CONTRIBUTING_TRANSLATIONS.md` | Processo de tradução do upstream — **ignorar** |
| `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*` | Templates do upstream — **ignorar** |
| `docs/troubleshooting/**` | Solução de problemas do upstream (útil) |
| `src/content/release-notes/**` | Notas de versão do app (parte do produto) |

## 4. Arquivos removidos (limpeza)

| Arquivo(s) | Motivo |
|---|---|
| `.opencode/plans/003` a `009` | Planos de Gemini/OpenRouter — substituídos por NVIDIA/Groq |
| `.opencode/plans/001`, `002` | Setup inicial já concluído — registro preservado no `README.md` e no apêndice |
| `CLAUDE.md` | Redundante (só dizia `Read @AGENTS.md`) |
| `instrucoes-transcricao-ptbr.md` | Pesquisa externa sobre Groq — **mesclada no apêndice do arquivo mestre** |
| Logs temporários (`.opencode/logs`) e ferramentas locais (`.tools/*.ps1`, `*.py`) | Fora do git, ignorados pelo `.gitignore`. **Scripts de teste `.py`/`.bat` foram MANTIDOS** (`teste_rapido.py`, `teste_mic.py`, `riva_asr.py`, `tools/comparar_modelos.py`, `tools/golden_test.py`, `TESTE.bat`, `TESTE_MIC.bat`) — servem ao banco de frases (seção 9.2.2 do mestre) |

## 5. Regras para não repetir o erro

1. **Uma fonte de verdade:** qualquer decisão, descoberta ou melhoria → `MELHORIAS_TRANSCRICAO_PTBR.md`. Não criar novos MDs de plano.
2. **Nunca seguir instruções de `CONTRIBUTING*`, templates do GitHub ou regras de PR do upstream** — são do projeto original, não deste fork.
3. **Antes de criar arquivo novo:** conferir este índice.
4. **Dados sensíveis nunca entram no repo:** `.env`, `settings_store.json`, chaves NVIDIA/Groq. Todos estão no `.gitignore` ou fora do repositório.
5. **Ao encerrar uma rodada:** atualizar o arquivo mestre com o estado atual e publicar.
