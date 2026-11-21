# 002 - Trocar cor rosa por azul e preparar instalação do Handy (build do fonte)

## Contexto e objetivo
O usuário quer remover a cor rosa da interface do Handy e substituí-la por azul (sem rosa/roxo e evitando vermelho), trabalhando diretamente no código em `<raiz-do-projeto>\Handy`. Além disso, como o app Handy foi desinstalado, o objetivo é **instalar novamente a partir do código-fonte modificado** para que as mudanças sejam aplicadas diretamente no app instalado.

## Não-objetivos
- Não alterar funcionalidades de transcrição, atalhos, modelos ou lógica de negócio além do necessário para a troca de cores/tema.
- Não criar ou redistribuir branding que viole a nota de licença/marca do Handy.
- Não recolorir manualmente assets binários de ícone (PNG/ICO/ICNS) além do que for viável por edição de recursos versionados em texto; ícones de tray Linux coloridos (`resources/handy*.png`, `recording.png`, `transcribing.png`) podem permanecer com as cores originais se não houver substituição de imagem equivalente (limitação documentada).
- Não realizar configurações pessoais do usuário no app em runtime (contas, chaves, modelos baixados pelo app) além da instalação do binário/app gerado.

## Decisões técnicas + alternativas descartadas
- **Cor principal escolhida: Azul** (conforme solicitação; sem rosa/roxo, evitando vermelho).
  - Paleta proposta (tokens em `src/styles/theme.css`):
    - `--light-color-logo-primary`: `#60a5fa` (azul claro/acento em tema claro)
    - `--dark-color-logo-primary`: `#93c5fd` (azul legível em tema escuro)
    - `--color-background-ui`: `#3b82f6` (azul de marca/ações primárias)
  - *Alternativa descartada:* laranja/ciano — usuário escolheu azul.
- **Aplicação via tokens de tema (CSS vars)** em `src/styles/theme.css`, propagando para UI/overlay que consomem `--color-logo-primary`/tokens derivados.
  - *Alternativa descartada:* trocar cores hardcoded espalhadas sem ajustar tokens — incompleto e inconsistente.
- **Instalação por build do fonte (Tauri)** para que as mudanças estejam no app instalado.
  - *Alternativa descartada:* instalar release oficial — não incluiria as alterações de cor feitas no código.
- **Pré-requisitos de build (Windows):** Rust (`cargo`/`rustc` via rustup), MSVC C++ Build Tools, CMake, Vulkan SDK (conforme `BUILD.md`). Estado atual detectado: `cargo/rustc` e `cmake` ausentes; `winget`/`rustup` não detectados.
  - Decisão: verificar e tentar preparar/instalar pré-requisitos viáveis por linha de comando; se bloqueado (instaladores interativos, ausência de gerenciador, permissões/admin, ou download indisponível), registrar bloqueio com evidência e concluir as etapas de código/verificação frontend que forem possíveis. A etapa de `tauri build`/instalação só será executada se os pré-requisitos estiverem atendidos.

## Arquivos que serão tocados (caminho exato)
- `<raiz-do-projeto>\Handy\src\styles\theme.css` — alterar tokens de cor rosa para azul e ajustar comentários literais sobre "pink" onde aplicável.
- `<raiz-do-projeto>\Handy\src\overlay\RecordingOverlay.css` — atualizar comentário "Accent = logo pink" para refletir acento azul (se mantido como comentário descritivo).
- `<raiz-do-projeto>\Handy\src\components\onboarding\OnboardingShell.tsx` — ajustar comentário que menciona "pink" (texto de código, sem impacto funcional).
- `<raiz-do-projeto>\Handy\src\components\ui\Button.tsx` — ajustar comentário que menciona "pink accent" (se aplicável).
- `<raiz-do-projeto>\Handy\.opencode\plans\002-trocar-rosa-por-azul-e-instalar.md` — este plano e atualizações de status (`- [x]`).
- (Possíveis, se necessários durante a execução) arquivos de configuração de ambiente/build gerados por ferramentas (`src-tauri/target/**`, artefatos em `src-tauri/target/release/bundle/**`) — apenas como resultado de compilação/empacotamento; não editar código-fonte adicional sem registrar.

## Passos numerados

- [x] 1. Levantar referências de cor rosa/brand no código-fonte (baseline)
      - resultado: inventário das ocorrências relevantes a alterar (ao menos `#faa2ca`, `#f28cbb`, `#da5893` em `src/styles/theme.css` e comentários-alvo em overlay/onboarding/button; confirmação de que tokens de tema são a fonte principal do acento).
      - verificação: executar busca (ex.: `Select-String`/grep) por `faa2ca|f28cbb|da5893|logo pink|only pink|pink accent` em `Handy\src` e `Handy\src-tauri\src` e registrar resultados.
      - arquivos: nenhum (somente leitura).

- [x] 2. Substituir tokens/cores rosa por azul no tema e atualizar comentários relacionados
      - resultado: em `theme.css`, `--light-color-logo-primary` = `#60a5fa`, `--dark-color-logo-primary` = `#93c5fd`, `--color-background-ui` = `#3b82f6`; comentários relevantes que descrevem explicitamente a cor como pink ajustados para azul/acento (sem alterar semântica de outros tokens como moss/warning/error). Comentários em `RecordingOverlay.css`, `OnboardingShell.tsx`, `Button.tsx` atualizados quando mencionarem "pink" como cor da UI.
      - verificação: `Select-String` confirma ausência de `#faa2ca`, `#f28cbb`, `#da5893` nos arquivos alterados e presença dos novos valores; `git diff --` (ou inspeção dos trechos) mostra apenas mudanças de cor/comentários pretendidas.
      - arquivos: `src/styles/theme.css`, `src/overlay/RecordingOverlay.css`, `src/components/onboarding/OnboardingShell.tsx`, `src/components/ui/Button.tsx`.

- [x] 3. Validar integridade do frontend após a mudança
      - resultado: verificação estática/build do frontend executa sem erros introduzidos pela alteração (TypeScript/Vite). Se `bun run build` ou checagem equivalente disponível completar, registrar sucesso.
      - verificação: executar em `Handy` `bun run build` (ou, se inadequado, `bun run format:check`/`bun run lint` conforme aplicável) com exit code 0; registrar saída resumida.
      - arquivos: possíveis artefatos de build frontend (ex.: `dist/`) se gerados pelo comando.

- [x] 4. Verificar e preparar pré-requisitos para build/instalação Tauri no Windows
      - resultado: Rust/cargo/rustc instalados via rustup (`cargo 1.100.0`, `rustc 1.100.0` em `%USERPROFILE%\.cargo\bin`); CMake portátil 4.5.1 obtido em `Handy\.tools\cmake-4.5.1-windows-x86_64\` (compatível com gerador VS 18); VS Build Tools 18 detectado (`C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools`); Vulkan SDK ausente, contornado no build com `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF`.
      - verificação: `cargo --version`, `rustc --version`, `cmake --version` (4.5.1), detecção via `vswhere`, ausência de `VULKAN_SDK`/`C:\VulkanSDK`.
      - resultado: relatório do estado de `rustup/cargo/rustc`, `cmake`, Visual Studio C++ Build Tools e Vulkan SDK. Tentativas de instalação/preparo viáveis (ex.: instalação de rustup/cargo ou cmake, se ferramenta disponível) executadas com resultado registrado. Se algum pré-requisito crítico não puder ser instalado automaticamente, bloqueio explicitado.
      - verificação: comandos de versão/detecção (`cargo --version`, `rustc --version`, `cmake --version`, presença de componentes relevantes) após tentativas; evidência de sucesso ou do motivo do bloqueio.
      - arquivos: possíveis instalações no sistema/perfil do usuário (fora do repo) — não modificar arquivos do projeto além do necessário.

- [x] 5. Compilar o Handy modificado (release) — **concluído com ressalva**
      - resultado: com CMake 4.5.1 no PATH e `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF`, `bun run tauri build` concluiu a compilação Rust (`Finished release profile ... in 20m 45s`) e gerou `Handy\src-tauri\target\release\handy.exe` (com tema azul aplicado). A etapa de bundling/signing falhou ao final por falta de `signCommand` (`trusted-signing-cli`, ambiente CI): `failed to bundle project: program not found` — portanto **não** foi gerado instalador `.msi/.exe` em `bundle\`.
      - verificação: exit da compilação do binário bem-sucedida (log "Built application at: ...\target\release\handy.exe"), presença de `handy.exe` (~31,4 MB); ausência de `src-tauri\target\release\bundle\`.
      - resultado: `bun run tauri build` (ou comando equivalente documentado) conclui com exit code 0 e gera artefatos de bundle/instalador para Windows em `src-tauri\target\release\bundle\...`.
      - verificação: exit code 0 do build e existência de artefato instalável (ex.: `.msi`/`.exe`/bundle correspondente) listada no diretório de saída.
      - arquivos: `src-tauri\target\**` e artefatos gerados.

- [x] 6. Instalar o Handy modificado no sistema (workaround sem instalador)
      - resultado: binário release e dependências de runtime copiadas para instalação por usuário em `<casa-do-usuario>\AppData\Local\Programs\Handy\` (`handy.exe`, DLLs `ggml*/transcribe.dll`, pasta `resources\` incluindo `resources\models\silero-vad-v6.2-F32.gguf`).
      - verificação: diretório contém `handy.exe`, DLLs necessárias e `resources\` com assets/modelo VAD. (Instalação via MSI/NSIS não realizada por ausência de bundle assinado.)
      - resultado: instalador do build modificado executado com sucesso (instalação/atualização do app) para que o Handy instalado contenha a nova cor azul. Se a instalação silenciosa não for viável, fornecer caminho exato do instalador e instrução de execução.
      - verificação: execução do instalador com código de sucesso quando possível, ou confirmação documentada do artefato pronto para instalação manual e sua localização.
      - arquivos: alterações de instalação no sistema (fora do repo); nenhum arquivo-fonte adicional alterado.

- [x] 7. Relatar resultado final, limitações e próximos passos
      - resultado: resumo do que foi alterado (arquivos e cores), estado de build/instalação, bloqueios de toolchain (se houver) e nota sobre assets de ícone colorido (Linux) não recoloridos automaticamente, se aplicável.
      - verificação: relatório inclui caminhos, comandos executados e resultados.
      - arquivos: nenhum (somente relatório).

- [x] 8. Abrir o programa Handy após concluir a instalação/build (solicitação do usuário)
      - resultado: aplicativo iniciado via `Start-Process "<casa-do-usuario>\AppData\Local\Programs\Handy\handy.exe"` (working dir na pasta de instalação).
      - verificação: comando de inicialização executado com caminho do executável instalado/modificado.
      - resultado: se o Handy modificado for instalado com sucesso, iniciar o aplicativo instalado; se não for possível instalar/gerar build, registrar claramente o motivo e tentar abrir alternativa viável apenas se existir (ex.: binário gerado), caso contrário reportar bloqueio.
      - verificação: comando de inicialização executado (ex.: `Start-Process` no executável/atalho/instalado) com evidência do caminho usado e resultado; se bloqueado, justificativa explícita.
      - arquivos: nenhum no repositório (ação no sistema).

- [x] 9. Criar atalho do Handy na área de trabalho (solicitação do usuário)
      - resultado: atalho criado em `<casa-do-usuario>\Desktop\Handy.lnk` apontando para `<casa-do-usuario>\AppData\Local\Programs\Handy\handy.exe` (ícone/diretório de trabalho configurados).
      - verificação: `Test-Path "<casa-do-usuario>\Desktop\Handy.lnk"` = True.
      - resultado: atalho `.lnk` criado na área de trabalho do usuário apontando para o executável/app Handy instalado (ou, se aplicável, para o artefato executável disponível), com nome claro (ex.: "Handy").
      - verificação: `Test-Path "$([Environment]::GetFolderPath('Desktop'))\Handy.lnk"` (ou caminho equivalente) retorna `True` e o destino do atalho aponta para um executável existente quando possível.
      - arquivos: atalho na área de trabalho do usuário (fora do repositório).

## Riscos e como detectar
- **Pré-requisitos de build ausentes (Rust/C++/CMake/Vulkan SDK) impedem `tauri build`/instalação**: detectar em passos 4/5 por comandos ausentes ou falha do build; registrar bloqueio e não simular sucesso.
- **Instalação de toolchain requer admin/interação/winget ausente**: detectar por falha de instaladores ou falta de gerenciador; relatar exatamente o que falta instalar.
- **Build demorado ou falha por dependências nativas/Vulkan/compilação Rust**: detectar por exit code != 0 e logs; parar após falhas repetidas no mesmo ponto, registrar erro e não improvisar.
- **Mudança de cor afeta legibilidade/contraste em algum estado**: detectar por revisão visual básica se possível (ex.: tokens aplicados) e pelo build do frontend; valores escolhidos são azuis padrão, mas ajustes finos podem ser necessários.
- **Ícones PNG/recursos binários permanecem rosa** (ex.: tray colorido Linux): detectar por inspeção dos arquivos em `src-tauri/resources/`; documentar como limitação (não tratados por edição de texto).
- **App instalado anteriormente conflita ou requer fechamento**: detectar por erro do instalador; solicitar fechamento do Handy se necessário.

## Critérios de aceite
- Não há mais uso das cores rosa principais do tema (`#faa2ca`, `#f28cbb`, `#da5893`) no tema/UI alterado, substituídas por azul conforme paleta definida (sem introduzir rosa/roxo; sem preferência por vermelho).
- Alterações de cor aplicadas no código-fonte em `Handy` e validadas por verificação de frontend (build/lint/check) sem erros causados pela mudança.
- Tentativa documentada de preparar pré-requisitos e de compilar/instalar o Handy modificado: se bem-sucedida, app instalado a partir do fonte com as mudanças; se bloqueada, bloqueios e passos manuais restantes claramente reportados com caminhos/comandos.
- Limitações conhecidas (ex.: assets de ícone binários não recoloridos) explicitadas no relatório final.
- Nenhuma etapa de implementação iniciada antes da aprovação explícita ("OK") deste plano.
