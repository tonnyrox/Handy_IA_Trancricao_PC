# 001 - Preparar ambiente de desenvolvimento do Handy (clone + deps frontend)

## Contexto e objetivo
Nesta máquina, a pasta `<raiz-do-projeto>` contém apenas `link.txt` apontando para o repositório do Handy (`https://github.com/cjpais/Handy`). O objetivo é preparar um "ambiente de desenvolvimento" local para **abrir o projeto Handy**: clonar o código-fonte em uma subpasta dedicada e instalar as dependências do frontend, verificando os pré-requisitos disponíveis no sistema, para que o projeto possa ser aberto no editor com suas dependências prontas.

## Não-objetivos
- Não compilar nem executar o app Tauri/Rust (`bun run tauri dev/build`) como parte deste plano.
- Não instalar Rust toolchain, C++ Build Tools, CMake, Vulkan SDK ou outras dependências de sistema ausentes (apenas identificar/relatar).
- Não alterar o código-fonte do Handy (somente clonar e instalar dependências).
- Não configurar assinatura, release, modelos Whisper/Parakeet adicionais ou permissões do sistema.
- Não mover/remover `link.txt`.

## Decisões técnicas + alternativas descartadas
- **Destino do clone: `.\Handy` (subpasta)** dentro de `<raiz-do-projeto>`.
  - *Alternativa descartada:* clonar na raiz desta pasta — maior risco de misturar arquivos e conflito com conteúdo existente; menos organizado.
- **Escopo de preparo: clonar + verificar ferramentas + `bun install` (frontend)**.
  - *Alternativa descartada:* apenas clonar — não deixaria dependências do frontend prontas para abrir/inspecionar o projeto com tipagem/resolve de pacotes.
  - *Alternativa descartada:* incluir build/dev completo — fora do escopo pedido e depende de toolchain Rust/C++/Vulkan no Windows.
- **Fonte do código:** `https://github.com/cjpais/Handy.git` (branch padrão do repositório remoto).
  - *Alternativa descartada:* copiar arquivos manualmente — perde histórico git e dificulta atualizações/comparações.
- **Gerenciador de pacotes:** `bun` (conforme `package.json`/`bun.lock` e instruções do projeto), já detectado no ambiente.
- **Download do modelo VAD de dev (Silero):** incluir como etapa opcional recomendada se `curl`/`Invoke-WebRequest` estiver disponível, pois `AGENTS.md` indica como necessário para desenvolvimento; porém não é bloqueante para "abrir o projeto" no editor. (Se falhar por rede, registrar e seguir — não bloqueia o objetivo principal.)

## Arquivos que serão tocados (caminho exato)
- `<raiz-do-projeto>\.opencode\plans\001-setup-dev-handy.md` — este plano (criado na fase de planejamento).
- `<raiz-do-projeto>\Handy\` (novo diretório) — clone completo do repositório Handy, incluindo:
  - `<raiz-do-projeto>\Handy\.git\...`
  - `<raiz-do-projeto>\Handy\package.json`, `bun.lock`, código-fonte etc. (conteúdo do repositório clonado)
  - `<raiz-do-projeto>\Handy\node_modules\...` (gerado por `bun install`)
  - (opcional) `<raiz-do-projeto>\Handy\src-tauri\resources\models\silero_vad_v5.onnx` ou arquivo VAD indicado pelo projeto, se etapa opcional executada com sucesso
- Nenhum outro arquivo fora desses caminhos será modificado.

## Passos numerados

- [x] 1. Verificar estado inicial e pré-requisitos no ambiente
      - resultado: relatório explícito (saída de comandos) mostrando: existência de `git`, `bun`, `node`, `cargo`/`rustc` e `cmake` (presentes ou ausentes com versão quando presente), e confirmação de que `.\Handy` ainda não existe ou está vazio antes do clone.
      - verificação: executar no PowerShell em `<raiz-do-projeto>` comandos como `git --version`, `bun --version`, `node --version`, `cargo --version` (ou indicação de ausente), `rustc --version` (ou ausente), `cmake --version` (ou ausente) e `Test-Path .\Handy`.
      - arquivos: nenhum (somente leitura/diagnóstico).

- [x] 2. Clonar o repositório Handy para `.\Handy`
      - resultado: repositório clonado com sucesso em `<raiz-do-projeto>\Handy`; `Test-Path .\Handy\.git` retorna `True` e arquivos-chave existem (`.\Handy\package.json`, `.\Handy\src-tauri\Cargo.toml`, `.\Handy\src\App.tsx` ou estrutura equivalente do repo).
      - verificação: `git clone https://github.com/cjpais/Handy.git Handy` (a partir da pasta do projeto) conclui com exit code 0; em seguida `Test-Path .\Handy\.git`, `Test-Path .\Handy\package.json`, `Test-Path .\Handy\src-tauri\Cargo.toml` retornam `True`.
      - arquivos: `<raiz-do-projeto>\Handy\**` (criados pelo clone).

- [x] 3. Instalar dependências do frontend com Bun
      - resultado: dependências instaladas em `.\Handy`; `bun install` conclui com exit code 0 e o diretório `.\Handy\node_modules` existe.
      - verificação: executar `bun install` no diretório `<raiz-do-projeto>\Handy`; confirmar `$LASTEXITCODE -eq 0` (PowerShell) e `Test-Path .\Handy\node_modules` retorna `True`.
      - arquivos: `<raiz-do-projeto>\Handy\node_modules\**` (e possíveis atualizações de metadados gerenciados pelo Bun, se aplicável).

- [x] 4. (Opcional, recomendado) Baixar modelo VAD para desenvolvimento, se possível (concluído: `silero-vad-v6.2-F32.gguf`)
      - resultado: se a rede/ferramenta permitir, arquivo de modelo VAD presente no caminho esperado pelo projeto para dev (conforme `AGENTS.md`: `src-tauri/resources/models/silero_vad_v5.onnx` ou URL/arquivo indicado na versão atual do repo). Se indisponível, registrar claramente "etapa opcional não concluída (motivo)" sem falhar o plano.
      - verificação: `Test-Path .\Handy\src-tauri\resources\models\*vad*` (ou caminho exato após checar instrução no repo clonado) retorna `True` quando concluída; caso contrário, evidência do erro/motivo registrada no relatório final.
      - arquivos: `<raiz-do-projeto>\Handy\src-tauri\resources\models\*` (somente se executada com sucesso).

- [x] 5. Relatar resultado final e como abrir o projeto
      - resultado: resumo final informando caminho do projeto (`...\Handy`), status de cada etapa, ferramentas presentes/ausentes (destacando ausência de Rust/cargo se aplicável) e instrução objetiva para abrir no editor (ex.: abrir a pasta `Handy`).
      - verificação: mensagem/relatório inclui caminhos e resultados das verificações dos passos 1-4.
      - arquivos: nenhum (somente relatório ao usuário).

## Atualização (reorganização solicitada pelo usuário)
- [x] R. Organizar tudo dentro de `.\Handy` (a pedido do usuário, para evitar bagunça na raiz)
      - resultado: `link.txt` movido para `<raiz-do-projeto>\Handy\link.txt` e `.opencode\` movido para `<raiz-do-projeto>\Handy\.opencode\`; a pasta raiz `<raiz-do-projeto>` contém apenas `Handy\`.
      - verificação: `Test-Path .\Handy\.opencode\plans\001-setup-dev-handy.md` = True, `Test-Path .\Handy\link.txt` = True e listagem da raiz mostra somente `Handy`.
      - arquivos: `<raiz-do-projeto>\Handy\link.txt`, `<raiz-do-projeto>\Handy\.opencode\**` (movidos).

## Riscos e como detectar
- **Rede/firewall/proxy impede `git clone` ou `bun install`**: detectar por exit code != 0 e mensagens de erro; não prosseguir para etapas dependentes sem resolver; registrar falha.
- **`bun install` falha por lockfile/versão/plataforma**: detectar por exit code != 0 e logs; relatar erro exato; não tentar "consertar" código do Handy.
- **Destino `.\Handy` já existe e não está vazio**: detectar com `Test-Path`/listagem antes do passo 2; parar e pedir decisão (não sobrescrever/apagar sem confirmação).
- **Falta de Rust/C++/CMake/Vulkan impede `tauri dev/build` no futuro**: detectar no passo 1 (ausência de `cargo`/`rustc` etc.); deixar explícito no relatório que abrir/editar frontend é possível, mas rodar app completo requer esses pré-requisitos (Windows).
- **Download do VAD falha (etapa opcional)**: detectar por falha de download ou arquivo ausente; não bloquear os objetivos principais (clonar + deps).

## Critérios de aceite
- Existe um clone do Handy em `<raiz-do-projeto>\Handy` com `.git` e arquivos principais do projeto.
- Dependências do frontend instaladas (`bun install` executado com sucesso em `Handy` e `node_modules` presente), conforme escopo aprovado.
- Pré-requisitos do ambiente verificados e reportados (incluindo o que está faltando para build Tauri/Rust completo).
- Nenhum arquivo do Handy foi modificado além do que resulta de clone/instalação de dependências (e download opcional do VAD, se realizado).
- Usuário recebe orientação clara de como abrir o projeto e próximos passos para rodar/buildar (se desejar instalar toolchain ausente).
- Nenhuma etapa de implementação foi executada antes da aprovação explícita ("OK") deste plano.
