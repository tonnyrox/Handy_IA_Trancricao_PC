# Handy (Fork) — Tema azul + transcrição cloud NVIDIA (PT-BR)

Este repositório contém uma versão personalizada do **[Handy](https://github.com/cjpais/Handy)** (projeto original de [cjpais](https://github.com/cjpais)), um aplicativo desktop **gratuito, open source e extensível** de **fala para texto (speech-to-text)**.

> **Fork/personalização:** [tonnyrox/Handy_IA_Trancricao_PC](https://github.com/tonnyrox/Handy_IA_Trancricao_PC)  
> **Upstream (original):** [cjpais/Handy](https://github.com/cjpais/Handy) — https://handy.computer

## Principais alterações desta versão

- **Tema azul:** acento/brand da interface trocado de rosa/magenta para azul (tema claro e escuro), via tokens CSS.
- **Transcrição cloud NVIDIA (PT-BR):** novo motor de transcrição em nuvem via **NVIDIA Riva ASR (Parakeet 1.1B Multilingual)** sobre gRPC, com idioma nativo `pt-BR`. Rápido (~3s), preciso e **sem exigir saldo/crédito** (diferente de OpenRouter, que exige saldo mínimo para áudio).
- **Revisão gramatical PT-BR via Groq:** toda fala passa por um LLM (`openai/gpt-oss-120b`) que corrige pontuação (vírgulas, `?`, `!`, `.`), acentuação, concordância, regência e crase, preservando o conteúdo. A chave Groq fica apenas na configuração local do app — nunca no repositório. Ver `MELHORIAS_TRANSCRICAO_PTBR.md`.
- **Sem etapas de onboarding:** o app abre direto na interface principal; a configuração é feita em **Configurações → Modelos**.
- **Botões Verificar / Aplicar** para o modelo cloud; modelo aplicado é refletido como ativo na lista de modelos.
- **Ferramentas de teste rápido** (sem buildar): `teste_rapido.py`, `teste_mic.py` (+ `.bat`), `riva_asr.py`.

> **Privacidade das credenciais:** chaves de API e function-id **nunca** são committed. Elas ficam apenas em `.env` (local, no `.gitignore`) e nas configurações locais do app (`settings_store.json`). O repositório é privado.

---

## Sumário

- [Diferenças desta versão em relação ao Handy original](#diferenças-desta-versão-em-relação-ao-handy-original)
- [Transcrição cloud NVIDIA (Parakeet / PT-BR)](#transcrição-cloud-nvidia-parakeet--pt-br)
- [O que é o Handy](#o-que-é-o-handy)
- [Como o Handy funciona](#como-o-handy-funciona)
- [Arquitetura e tecnologias](#arquitetura-e-tecnologias)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Pré-requisitos e configuração do ambiente](#pré-requisitos-e-configuração-do-ambiente)
- [Como compilar e instalar](#como-compilar-e-instalar)
- [Uso, configuração e recursos úteis](#uso-configuração-e-recursos-úteis)
- [Dados locais, modelos e caminhos](#dados-locais-modelos-e-caminhos)
- [Limitações conhecidas e observações desta build](#limitações-conhecidas-e-observações-desta-build)
- [Créditos, licença e marca](#créditos-licença-e-marca)

---

## Diferenças desta versão em relação ao Handy original

### Resumo da alteração
- **Alterado:** paleta de **acento/brand** da interface de **rosa/magenta** para **azul** (tema claro e escuro), propagada pelos tokens CSS do tema.
- **Alterado:** engine de transcrição cloud — **NVIDIA Riva ASR (Parakeet)** via gRPC, com `language-code=pt-BR`, em substituição a provedores anteriores.
- **Removido:** fluxo de onboarding por etapas (o app abre direto no menu principal).
- **Mantido:** pipeline de áudio, atalhos, histórico e demais funcionalidades do Handy original (salvo observações de build abaixo).
- **Não alterado:** ícones e imagens binárias (PNG/ICO/ICNS) — recoloração de assets fica para etapa futura.

## Transcrição cloud NVIDIA (Parakeet / PT-BR)

O motor de nuvem usa o modelo **Parakeet 1.1B Multilingual** da NVIDIA pelo serviço Riva ASR:

- **Endpoint:** `grpc.nvcf.nvidia.com:443` (gRPC, RPC `Recognize`)
- **Idioma:** `pt-BR` (português do Brasil) fixo no protocolo — a saída sempre vem em português
- **Autenticação:** `Authorization: Bearer <chave NVIDIA>` + `function-id` do modelo ativado na conta (build.nvidia.com)
- **Configuração no app:** `Configurações → Modelos` → motor **NVIDIA (cloud, API key)** → chave + modelo `nvidia/parakeet-1_1b-rnnt-multilingual-asr` → **Verificar** / **Aplicar**

### Credenciais locais (testes rápidos)
Os scripts de teste leem as credenciais de um `.env` local (não versionado):

```env
NVIDIA_API_KEY=nvapi-...
NVIDIA_FUNCTION_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Gestão de chave e verificação de modelos

- A chave NVIDIA expira (cerca de 24h). Em **Configurações → Modelos** você encontra os campos **Chave NVIDIA** e **Function-ID** — atualize ambos quando trocar de chave/modelo (o valor antigo é substituído, nunca acumulado).
- Erros de autenticação (401/403) agora mostram uma mensagem clara em português orientando a gerar uma nova chave em https://build.nvidia.com/settings/api-keys.
- O botão **"Verificar modelos"** usa a **última gravação salva** (`%APPDATA%\com.pais.handy\recordings\`) e testa os modelos da chave "por baixo do pano". Modelos que não transcrevem áudio são **ocultos do dropdown**; restam apenas os que funcionam (hoje, o Parakeet via Riva gRPC). Se não houver gravação, o app avisa antes de testar.

### Comparador de modelos (sem buildar)
```powershell
& "<venv>\Scripts\python.exe" "tools\comparar_modelos.py"
```

### Teste rápido sem buildar
```powershell
$py = "<venv>\Scripts\python.exe"
& $py "teste_rapido.py"          # transcreve a ultima gravacao
& $py "teste_mic.py"             # abre painel com botao PLAY (microfone)
```
Requer: `pip install nvidia-riva-client sounddevice numpy` no venv.

### Comparação de cores (tokens principais)

| Token / uso | Original (rosa) | Esta versão (azul) | Observação |
|---|---:|---:|---|
| `--light-color-logo-primary` (acento no tema claro) | `#faa2ca` | `#60a5fa` | Cor principal do logo/acento em modo claro |
| `--dark-color-logo-primary` (acento no tema escuro) | `#f28cbb` | `#93c5fd` | Cor principal do logo/acento em modo escuro |
| `--color-background-ui` (brand/ações primárias) | `#da5893` | `#3b82f6` | Usado para elementos de marca/ações primárias |

> Observação: `--color-logo-primary` é derivado desses tokens conforme o tema/sistema (`data-theme`/`prefers-color-scheme`), e diversos componentes/estilos (ex.: overlay, bordas de foco, destaques) consomem `--color-logo-primary` e valores derivados (`color-mix`), portanto a troca no tema se propaga pela UI.

### Arquivos modificados (alteração de tema/cor)

| Arquivo | O que mudou |
|---|---|
| `src/styles/theme.css` | Substituição dos valores dos tokens de acento/brand (rosa → azul) e ajustes de comentários descritivos que mencionavam "pink/pinks" no contexto do acento/wordmark/sucesso (ex.: "accent already means recording", "cut down on accent tones"). |
| `src/overlay/RecordingOverlay.css` | Comentário do acento atualizado (de "logo pink" para "brand blue") — o overlay usa `var(--color-logo-primary)` do tema. |
| `src/components/onboarding/OnboardingShell.tsx` | Comentário de UI ajustado ("accent-colored" em vez de "pink"). |
| `src/components/ui/Button.tsx` | Comentário ajustado ("brand accent" em vez de "pink accent") em variante relacionada a warning. |
| `src-tauri/src/tray.rs` | Comentários do tema "Colored" (Linux) ajustados para não afirmar "pink icons" (os ícones/recursos em si não foram recoloridos). |

### O que NÃO foi alterado nesta etapa
- **Assets binários de ícones/imagens** (ex.: `src-tauri/icons/*`, `src-tauri/resources/*.png` como `handy.png`, `recording.png`, `transcribing.png`, `handy_warning.png`, `tray_*`) **não foram recoloridos**. Em algumas plataformas/temas esses recursos podem manter as cores originais.
- **Funcionalidades do app** (gravação, VAD, transcrição, modelos, atalhos, histórico, pós-processamento, configurações, CLI, etc.) não foram alteradas intencionalmente.
- **Documentação original do upstream** foi substituída por este README detalhado do fork; arquivos como `BUILD.md`, `AGENTS.md`, `CONTRIBUTING.md` permanecem no repositório como referência técnica do projeto.

### Arquivos adicionados/organização neste fork
- `INDICE.md` — índice mestre da documentação (comece por aqui).
- `MELHORIAS_TRANSCRICAO_PTBR.md` — documento vivo com diagnóstico, decisões e plano de melhorias.
- `.opencode/plans/010` a `013` — histórico arquivado (resumo no apêndice do arquivo de melhorias).

- `.gitignore` — atualizado para ignorar `.tools/` (ferramentas locais de build, ex.: CMake portátil baixado durante a compilação).

---

## O que é o Handy

**Handy** é um aplicativo desktop de transcrição de voz para texto, focado em privacidade e simplicidade:
- **Offline/privado:** o processamento de áudio acontece localmente na máquina (sem envio de áudio para a nuvem).
- **Multiplataforma:** Windows, macOS e Linux.
- **Open source e extensível:** código disponível para estudo, modificação e contribuição.
- **Simples de usar:** atalho global → falar → texto colado no campo ativo.

### Funcionalidades principais (upstream)
- Atalhos configuráveis (segurar para gravar/soltar para parar, toggle, modos específicos).
- Transcrição local com modelos como **Whisper** e **Parakeet V3** (conforme suporte/modelos disponíveis no app).
- **VAD (Voice Activity Detection)** com Silero para filtrar silêncio.
- Histórico de transcrições, configurações de microfone/idioma/modelo, feedback sonoro, overlay de gravação, etc.
- Modo **Debug** (`Ctrl+Shift+D` no Windows/Linux, `Cmd+Shift+D` no macOS) e parâmetros de **CLI** para controle da instância em execução.

---

## Como o Handy funciona

Fluxo típico de uso:
1. **Atalho global** dispara o início da gravação (push-to-talk ou toggle).
2. **Captura de áudio** do microfone selecionado.
3. **VAD (Silero)** filtra trechos de silêncio/segmenta fala.
4. **Motor de transcrição** (ex.: Whisper/Parakeet via backend de inferência local) converte áudio em texto.
5. **Pós-processamento** (se habilitado/configurado) pode ajustar o texto.
6. **Saída**: o texto é inserido no aplicativo ativo (clipboard/paste/estratégias conforme plataforma/configuração) e pode ser salvo no histórico.

Características importantes:
- **Instância única:** ao abrir novamente, o app tende a focar a janela existente; flags de controle remoto são enviadas à instância em execução.
- **Processamento local:** modelos e inferência rodam na máquina do usuário (desempenho depende de CPU/GPU, modelo e sistema).

---

## Arquitetura e tecnologias

### Visão geral
O Handy é construído com **Tauri 2.x**:
- **Backend:** Rust (lógica principal, áudio, transcrição, atalhos, sistema, tray, configurações)
- **Frontend:** React + TypeScript + Vite + Tailwind CSS (interface, onboarding, settings, overlay)

### Padrões de arquitetura (conforme projeto)
- **Manager pattern:** funcionalidades centrais organizadas em managers (ex.: áudio, modelo, transcrição, histórico), inicializados no startup e gerenciados via estado do Tauri.
- **Command/Event:** frontend chama comandos Tauri; backend emite eventos para o frontend.
- **Pipeline:** Áudio → VAD → ASR (Whisper/Parakeet etc.) → Texto → Clipboard/Paste.
- **Estado/configuração:** store do frontend + comandos Tauri + persistência (plugin de store do Tauri).

### Backend (Rust, `src-tauri/src/`) — principais áreas
- `lib.rs` / `main.rs` / `cli.rs`: inicialização do app, setup Tauri, parsing/aplicação de argumentos CLI.
- `managers/`: `audio.rs`, `model.rs`, `transcription.rs`, `history.rs` (núcleo da lógica).
- `audio_toolkit/`: captura, processamento, VAD, utilitários de áudio.
- `commands/`: comandos expostos ao frontend.
- `shortcut.rs`, `overlay.rs`, `tray.rs`, `settings.rs`, `notices.rs`, `signal_handle.rs`, `utils.rs`: integrações de sistema/UI/estado/notificações.

### Frontend (React/TS, `src/`) — principais áreas
- `App.tsx`: fluxo principal/onboarding.
- `components/` (settings, model-selector, onboarding, overlay, notices, etc.), `hooks/`, `stores/`, `i18n/`, `bindings.ts` (bindings Tauri), `overlay/`.
- `styles/theme.css` e estilos de overlay: **tokens de tema** (onde a personalização azul desta versão foi aplicada).

### Bibliotecas/tecnologias relevantes
- **ASR/inferência:** `transcribe-cpp` (Whisper/Parakeet/Moonshine/SenseVoice etc., GGML/GGUF) com aceleração conforme plataforma/build.
- **Captura de áudio:** `handy-recorder` (dispositivos, resample, etc.).
- **VAD:** Silero VAD (e/ou componentes relacionados no toolkit).
- **Atalhos globais:** `rdev`.
- **Áudio de feedback:** `rodio`.
- **UI:** React, TypeScript, Tailwind CSS, Zustand, i18next.

---

## Estrutura do projeto

```text
Handy/
├─ src/                      # Frontend (React + TypeScript)
│  ├─ components/            # UI (settings, onboarding, overlay, notices, etc.)
│  ├─ overlay/               # Entrada/UI do overlay de gravação
│  ├─ styles/                # Tema/tokens (ex.: theme.css)
│  ├─ stores/, hooks/, i18n/ # Estado, hooks e internacionalização
│  └─ ...
├─ src-tauri/                # Backend (Rust + config Tauri)
│  ├─ src/                   # Código Rust (managers, commands, tray, overlay, etc.)
│  ├─ resources/             # Recursos empacotados (ícones, sons, configs, modelos dev)
│  ├─ icons/                 # Ícones do app/bundle
│  ├─ tauri.conf.json        # Configuração do Tauri/bundle
│  └─ Cargo.toml
├─ .opencode/plans/          # Planos/registro das alterações deste fork
├─ BUILD.md                  # Instruções de build (upstream/projeto)
├─ AGENTS.md                 # Guia de arquitetura/desenvolvimento (upstream/projeto)
├─ README.md                 # Este README (fork)
└─ ...
```

> Pastas como `node_modules/`, `dist/`, `target/` e `.tools/` podem existir localmente durante desenvolvimento/build, mas são ignoradas pelo Git conforme `.gitignore`.

---

## Pré-requisitos e configuração do ambiente

### Desenvolvimento (geral)
- **[Rust](https://rustup.rs/)** (stable) — necessário para backend/Tauri.
- **[Bun](https://bun.sh/)** — gerenciador de pacotes/scripts do frontend.
- **Pré-requisitos do Tauri** por plataforma: https://tauri.app/start/prerequisites/

### Windows (build completo do app Tauri)
Além de Rust e Bun, normalmente são necessários (ver `BUILD.md`):
- **Microsoft C++ Build Tools** (Visual Studio/Build Tools com componentes C++).
- **CMake** (no `PATH`).
- **Vulkan SDK (LunarG)** — exigido pelo fluxo de build do backend de inferência usado pelo projeto (componentes como `vulkan-shaders-gen`), conforme instruções do `BUILD.md`.

> **Nota prática (desta personalização/build local):** em um ambiente Windows com **Visual Studio Build Tools 18** instalado, foi necessário usar **CMake 4.5.1** (compatível com o gerador "Visual Studio 18 2026") e, na ausência do Vulkan SDK, compilar com `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF` para conseguir gerar o binário release. Isso pode impactar recursos/aceleração relacionados a Vulkan nesta build específica.

### Dependências do projeto
Na raiz de `Handy/`:
```bash
bun install
```

### Modelo VAD para desenvolvimento (recomendado/necessário para dev)
Conforme `AGENTS.md` do projeto:
```bash
mkdir -p src-tauri/resources/models
curl -L -o src-tauri/resources/models/silero-vad-v6.2-F32.gguf https://huggingface.co/handy-computer/silero-vad-v6.2-gguf/resolve/main/silero-vad-v6.2-F32.gguf
```
(No Windows/PowerShell, você pode usar `curl.exe` ou `Invoke-WebRequest`.)

---

## Como compilar e instalar

### Executar em desenvolvimento
```bash
bun install
bun run tauri dev
```
- Frontend apenas: `bun run dev` (Vite), `bun run build` (TypeScript + Vite).

### Build de produção (Tauri)
```bash
bun run tauri build
```
Esse comando normalmente gera binários e bundles/instaladores por plataforma (ex.: `.msi/.exe` no Windows) em `src-tauri/target/release/bundle/...`.

#### Observações de build (Windows, experiência desta versão)
- Se o bundling/assinatura falhar localmente por `signCommand` de CI (ex.: `trusted-signing-cli` ausente), ainda pode existir o binário compilado em `src-tauri/target/release/handy.exe`. Nesses casos, o `BUILD.md` sugere alternativas como `--no-bundle` para cenários de desenvolvimento/local.
- Se houver conflito **CMake x gerador do Visual Studio** (ex.: CMake antigo sem suporte ao gerador do VS instalado), use uma versão de CMake compatível.
- Sem **Vulkan SDK**, o build pode falhar; uma alternativa (usada nesta personalização para viabilizar a compilação) foi desativar Vulkan no build nativo do transcribe:
  ```powershell
  $env:TRANSCRIBE_CMAKE_ARGS = "-DTRANSCRIBE_VULKAN=OFF"
  bun run tauri build
  ```

### Instalação manual (fallback usado nesta personalização)
Quando o instalador/bundle não é gerado, é possível preparar uma instalação por usuário copiando o executável e dependências de runtime para uma pasta local, por exemplo:
- `%LOCALAPPDATA%\Programs\Handy\`
  - `handy.exe`
  - DLLs de runtime necessárias (ex.: `ggml*.dll`, `transcribe.dll`)
  - `resources\` (ícones, sons, configs e modelos necessários, como VAD)

> A disposição exata de DLLs/recursos pode variar conforme versão/build; o ideal é usar o bundle gerado pelo Tauri quando disponível.

### Lint e formatação
```bash
bun run lint
bun run lint:fix
bun run format
bun run format:check
```

---

## Uso, configuração e recursos úteis

### Uso básico
1. Abra o Handy e conceda as permissões necessárias (microfone/acessibilidade conforme o sistema).
2. Configure atalho(s) e preferências (dispositivo de áudio, idioma, modelo, etc.).
3. Use o atalho para gravar e deixar o app transcrever/colar o texto.

### Modo Debug
- **Windows/Linux:** `Ctrl+Shift+D`
- **macOS:** `Cmd+Shift+D`

### Parâmetros de linha de comando (CLI)
Exemplos (controle de instância em execução / inicialização):
```bash
handy --toggle-transcription
handy --toggle-post-process
handy --cancel
handy --start-hidden
handy --no-tray
handy --debug
```

### Hooks e integrações (avançado)
- Hook de transcrição (macOS/Linux): permite transformar o texto antes de colar via script executável em `hooks/transcription` no diretório de dados do app.
- Integrações de terceiros (ex.: extensão Raycast) existem no ecossistema do Handy original.

---

## Dados locais, modelos e caminhos

Diretórios típicos de dados do aplicativo (podem variar por versão/sistema):
- **Windows:** `C:\Users\<usuário>\AppData\Roaming\com.pais.handy\`
- **macOS:** `~/Library/Application Support/com.pais.handy/`
- **Linux:** `~/.config/com.pais.handy/`

Nesses locais podem ficar configurações, histórico, modelos (`models/`), hooks e outros arquivos de runtime. O caminho exato pode ser consultado nas configurações do app (ex.: seção "About").

---

## Limitações conhecidas e observações desta build

- **Ícones não recoloridos:** esta personalização alterou apenas o **tema/acento azul** via CSS/tokens e comentários relacionados; **assets binários de ícones** permanecem como no original (recoloração planejada futuramente).
- **Build Windows desta personalização:** para viabilizar a compilação local sem Vulkan SDK, foi usado `TRANSCRIBE_CMAKE_ARGS=-DTRANSCRIBE_VULKAN=OFF`; isso pode desabilitar aceleração/backend Vulkan nesta build.
- **Instalação local manual:** na ausência de bundle/instalador assinado gerado pelo Tauri no ambiente local, a instalação foi feita por cópia do binário e dependências para `%LOCALAPPDATA%\Programs\Handy\` e criação de atalho na área de trabalho.
- **Limitações gerais do Handy (upstream):** variam por plataforma (ex.: permissões no macOS, restrições em apps executando como administrador no Windows, particularidades de Wayland/paste no Linux, etc.). Consulte `README.md`/issues do projeto original e a documentação do app para detalhes atualizados.

---

## Créditos, licença e marca

- **Projeto original:** [Handy](https://github.com/cjpais/Handy) por [cjpais](https://github.com/cjpais) e colaboradores.
- **Este fork/personalização:** [tonnyrox/Handy_IA_Trancricao_PC](https://github.com/tonnyrox/Handy_IA_Trancricao_PC) — alterações de tema (acento azul) e documentação desta versão.
- **Licença do código:** MIT (ver arquivo [`LICENSE`](LICENSE)).
- **Marca e assets de marca:** o nome Handy, logotipo, ícones e assets de marca **não** são open source para redistribuição/branding não oficial. Forks e redistribuições não oficiais devem usar identidade própria e não sugerir afiliação/endorso. Esta documentação descreve uma personalização para uso/estudo; mantenha os avisos de licença e atribuição ao projeto original.

### Agradecimentos (upstream)
- Whisper (OpenAI), ggml, Silero VAD, equipe Tauri e comunidade de contribuidores do Handy.


---

## Teste rápido de transcrição (NVIDIA) — sem buildar

O script [`teste_rapido.py`](teste_rapido.py) testa a transcrição direto na API da NVIDIA usando a **mesma configuração do app** (modelo, prompt pt-BR, thinking ligado, `max_tokens=8192`). Use-o para trocar modelo/prompt e validar a saída em português **em segundos**, sem recompilar o Handy.

```powershell
$py = "<venv>\Scripts\python.exe"
& $py "tools\comparar_modelos.py"            # transcreve a gravação .wav mais recente
& $py "tools\comparar_modelos.py" --listar    # lista todos os modelos da chave NVIDIA
```

- Edite `MODELO`, `PROMPT` e `THINKING` no topo do script para testar variações.
- A gravação mais recente fica em `%APPDATA%\com.pais.handy\recordings\`.
- **Importante:** `THINKING=True` mantém a transcrição em português do Brasil; com `False` o modelo traduz para inglês.
- Modelo recomendado (o único que realmente transcreve áudio na chave): `nvidia/parakeet-1_1b-rnnt-multilingual-asr`.


---

## Teste rápido de transcrição (sem buildar)

Use o arquivo **`teste_rapido.py`** (na raiz do projeto) para testar a transcrição em **segundos**, sem recompilar o Handy. Ele usa a gravação `.wav` mais recente e a mesma configuração do app (modelo, prompt pt-BR, `max_tokens=8192`).

**Forma mais fácil:** dê duplo clique em **`TESTE.bat`**.

Ou no PowerShell, na pasta do projeto:

```powershell
& "<venv>\Scripts\python.exe" "teste_rapido.py"           # transcreve a ultima gravacao
& "<venv>\Scripts\python.exe" "teste_rapido.py" listar    # lista os modelos da chave
& "<venv>\Scripts\python.exe" "teste_rapido.py" modelo ID  # testa outro modelo
```

- Fale em português, aperte **Caps Lock** no app, rode o teste.
- O script avisa se a transcrição vier em inglês.
- Modelo que realmente transcreve: `nvidia/parakeet-1_1b-rnnt-multilingual-asr`.


---

## Estado atual (versão estabilizada)

Esta versão foi estabilizada com base na auditoria dos planos em `Planos/01-04_PLANO_DE_MELHORIAS.md`:

- **Motor NVIDIA Cloud (Parakeet 1.1B via Riva gRPC, PT-BR)** como único motor de nuvem; modelos locais e cloud exibidos em seções separadas (nuvem primeiro, à esquerda; local à direita).
- **Chave NVIDIA + Function-ID** configuráveis em Configurações → Modelos, com botões independentes: **Verificar configuração** (testa chave/conexão), **Verificar modelos** (testa os modelos com a última gravação e persiste o resultado) e **Aplicar** (salva).
- **Indicador de voz (speak)** no overlay: picos altos e próximos à borda.
- **Janela inicial** em 1100×700 px no PC.
- **Precisão PT-BR**: prompt de limpeza em português, remoção de muletas PT-BR, `temperature: 0.1` no LLM e guarda de fidelidade (se a revisão inventar/resumir, o texto original é preservado).
- **Confiabilidade**: conexão gRPC nova por fala (corrige travamento), retry em erros transitórios, chunk de áudio longo, mensagens próprias para chave expirada (401/403) e limite de requisições (429).
- **Testes**: `cargo test --lib` → 344 passam, 0 falham; `bun run build` OK.

### Testes rápidos (sem buildar)
```powershell
& "<venv>\Scripts\python.exe" "teste_rapido.py"          # última gravação
& "...\python.exe" "teste_mic.py"                                                       # painel com PLAY
& "...\python.exe" "tools\comparar_modelos.py"                                         # compara modelos
& "...\python.exe" "tools\golden_test.py"                                              # 10 frases PT-BR
```
`.env` (local, ignorado pelo Git) contém `NVIDIA_API_KEY` e `NVIDIA_FUNCTION_ID`. Nunca versionar chaves.
