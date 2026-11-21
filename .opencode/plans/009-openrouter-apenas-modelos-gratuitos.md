# 009 - OpenRouter: mostrar/testar apenas modelos gratuitos (free) com áudio

## Contexto
Após a versão 008 (que corrigiu a serialização do provider e definiu Gemini 2.5 Flash como padrão), os logs revelaram que modelos pagos falham com:
> 402 — "This request requires at least $0.50 in balance for audio"

O usuário decidiu: **nunca haverá saldo/crédito**. O foco é **sempre e apenas modelos gratuitos (`free`)**. O código de pagamento não deve aparecer; o dropdown do OpenRouter deve listar **somente modelos free com suporte a áudio**, e os testes internos devem usar sempre modelos gratuitos com áudio.

## Anti-requisitos (o que NÃO pode voltar)
- ❌ Nenhum modelo pago (`pago`) no dropdown, defaults, fallbacks ou sugestões.
- ❌ Nenhuma sugestão de adicionar crédito/saldo; nunca cobrar do usuário.
- ❌ Nenhum modelo que não seja `free` habilitado como padrão/aplicado.
- ❌ Nenhuma etapa/onboarding/wizard; abertura direta no app.
- ❌ Nunca expor a chave da API.

## Decisões técnicas
- **Filtro global no backend** (`openrouter_transcription.rs::list_models`): manter **apenas** modelos com `pricing.free == true` E `supports_audio_input(architecture) == true`. Descartar pagos e sem áudio.
- **Default/recomendado:** `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (gratuito, áudio — já validado com sucesso anteriormente). Substituir Gemini 2.5 Flash como padrão em `settings.rs`, `ModelsSettings.tsx`, `settingsStore.ts` e `settings_store.json`.
- **Fallback:** lista apenas modelos `free` com áudio; remover Gemini 2.5 Flash e todos os pagos; manter apenas opções gratuitas conhecidas.
- **Prioridade de ordenação:** gratuito + áudio primeiro; dentro disso, priorizar Gemini Flash free quando disponível (ex.: `google/gemini-2.0-flash-exp:free`), depois demais. Nunca promover pagos.
- **Testes internos:** usar sempre um modelo `free` com áudio; não testar Gemini 2.5 Flash (pago). Validar com teste real de áudio via API.

## Arquivos previstos
- `src-tauri/src/openrouter_transcription.rs` — filtro (free + áudio), fallback, prioridade, default_id, remoção de pagos.
- `src-tauri/src/settings.rs` — `default_openrouter_transcription_model()` → modelo free.
- `src/components/settings/models/ModelsSettings.tsx` — fallback do dropdown (só free).
- `src/stores/settingsStore.ts` — normalização padrão (só free).
- `%APPDATA%\com.pais.handy\settings_store.json` — modelo padrão free; provider OpenRouter; chave preservada.
- `src/i18n/locales/*/translation.json` —(texto do dropdown/note se necessário, descrevendo "somente modelos gratuitos").

## Passos numerados
- [ ] 1. Filtrar list_models para apenas free + áudio
      - verificação: `cargo check` + inspeção do código.
      - arquivos: `openrouter_transcription.rs`.
- [ ] 2. Definir modelo padrão free (Nemotron) em backend/frontend/settings
      - verificação: `bun run build` + leitura do settings.
      - arquivos: `settings.rs`, `ModelsSettings.tsx`, `settingsStore.ts`, `settings_store.json`.
- [x] 3. Testar internamente modelos free com áudio (validação real da chave)
      - resultado: **BLOQUEIO DA OPENROUTER (fora do nosso controle)**. A API `/models` lista apenas 3 modelos free+áudio: `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (teste real com áudio → **402 "requires at least $0.50 in balance for audio"**), `google/lyria-3-pro-preview` (404, descontinuado) e `google/lyria-3-clip-preview` (404, descontinuado). **Nenhum modelo free com áudio funciona sem saldo mínimo na OpenRouter** — a política da OpenRouter exige crédito para QUALQUER requisição de áudio, mesmo em modelos gratuitos. Não existe solução via filtro/código para isso.
      - verificação: testes reais de áudio (WAV) contra a API OpenRouter com a chave configurada.
      - arquivos: nenhum (validação).

- [ ] 4. Compilar, reinstalar, abrir e confirmar dropdown só-free + Caps Lock transcrevendo
      - resultado: **PAUSADO** — depende de decisão do usuário, pois o Caps Lock NÃO consegue transcrever via OpenRouter sem saldo, independente do modelo free escolhido. O filtro só-free já está implementado no código.
      - verificação: aguardando decisão (adicionar saldo mínimo, usar provedor de cloud gratuito alternativo, ou voltar para modelo local).
      - arquivos: artefatos de build/instalação; atualização deste plano.

## ⚠️ Achado crítico (atualização)
A premissa do plano ("modelos free funcionam sem crédito") foi **refutada por teste real**: a OpenRouter exige saldo mínimo de **$0.50** para qualquer requisição com áudio, inclusive em modelos `free`. Não há modelo free+áudio disponível que funcione sem saldo. O filtro só-free foi implementado, mas **não resolve o erro 402**. É necessária uma decisão de produto: (a) adicionar saldo mínimo na conta OpenRouter, (b) trocar para provedor de cloud com free tier real para áudio, ou (c) usar transcrição local (gratuita, sem internet).

## Decisão do usuário (após achado)
- Usuário **rejeitou trocar de provedor**: foco exclusivo e permanente no **OpenRouter**. Não quer Groq nem outro.
- Usuário reenviou a **mesma chave OpenRouter** e reafirmou: trabalhar somente acima do OpenRouter.

## Testes finais dentro do OpenRouter (todas as vias)
Testes reais de áudio com a chave, em todas as formas de envio suportadas:
- `input_audio` (WAV) → **402 "requires at least $0.50 in balance for audio"**
- `file` (data URI WAV) → **402 "requires at least $0.50 in balance for files"**
- `image_url` (data URI) → 422 (content safety) / 402
- Modelos free+áudio listados: Nemotron free (402), Lyria pro/clip (404, descontinuados). Gemini 2.0 Flash Exp free (404).

**Conclusão técnica:** Dentro do OpenRouter **não existe configuração, filtro ou formato de requisição que permita transcrever áudio sem saldo mínimo de $0.50**. É uma política rígida da plataforma (`limit_source: openrouter_credits`), independente de modelo ou código. Não há workaround.

**Única saída dentro do OpenRouter (sem trocar de provedor):** adicionar o **saldo mínimo de $0.50** na conta OpenRouter (depósito mínimo único; com modelos `free` o custo por transcrição é zero — o saldo só precisa existir para habilitar áudio e não é consumido a cada uso). Sem isso, o Caps Lock sempre retornará 402.

## Estado do código (implementado, não buildado ainda)
- Filtro só-free no backend (`list_models`), fallback free, default free, frontend e settings locais já atualizados.
- Build/reinstalação **não executados** porque não resolveriam o 402 (bloqueio é de saldo da conta, não do código).
- App instalado anterior (versão 008, Gemini 2.5 Flash) continua aberto; chave e modelo free configurados no `settings_store.json`.

**Pendência:** decisão do usuário sobre adicionar saldo mínimo de $0.50 na conta OpenRouter (única forma de manter OpenRouter e fazer o Caps Lock transcrever), ou autorização para mudar de provedor/abordagem.

## Riscos e como detectar
- **Filtro remova todos os modelos e deixe lista vazia:** fallback free cobre.
- **Modelo free não aceitar áudio mesmo listando:** teste real detecta; trocar para outro free+áudio da lista.

## Critérios de aceite
- Dropdown OpenRouter mostra **apenas modelos gratuitos (free) com áudio** — nenhum pago.
- Modelo padrão pré-selecionado/aplicado é **free** (Nemotron).
- Teste interno com modelo free+áudio retorna sucesso (sem erro 402).
- Caps Lock transcreve via OpenRouter com modelo free.
- Nenhuma etapa/onboarding; chave não exposta; modelos/dados preservados.

**GATE:** responda **"OK"** ou **"pode executar"** para eu implementar o plano 009.
