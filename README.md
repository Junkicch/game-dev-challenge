# Pirate Battle — solução (React + PixiJS)

Jogo single-player de batalha naval no navegador: partida em arena com ilhas,
Chasers e Shooters, ranking e histórico de partidas via APIs REST simuladas com
MSW, consumidas por Axios + TanStack Query.

- **Stack:** React 18 · TypeScript · Vite 5 · PixiJS 8 · TanStack Query 5 ·
  Axios · MSW 2 · Playwright
- **Documentação:** [`ARCHITECTURE.md`](ARCHITECTURE.md) (decisões, integração
  React/Pixi, limitações) · [`DESAFIO.md`](DESAFIO.md) (enunciado original) ·
  [`step.txt`](step.txt) (registro das fases)
- **Deploy:** URL pública — *pendente* (seção [Deploy](#deploy))

---

## Setup

Requisitos: **Node 18+** (recomendado 20) e npm.

```bash
npm ci                       # instalação com lockfile
npx playwright install chromium   # apenas para rodar os testes
npm run dev                  # http://localhost:5173
```

**Variáveis de ambiente:** nenhuma é necessária — o jogo roda 100% no browser
com mocks locais. Arquivos `.env` são suportados pelo Vite, mas o código não
consome nenhuma chave (`.env*` está no `.gitignore`, mantendo apenas
`.env.example` se um dia for preciso).

Build publicável (estático, sem backend):

```bash
npm run build     # tsc + vite build -> dist/
npm run preview   # serve dist/ em http://localhost:4173
```

O Service Worker do MSW é servido de `public/`, então qualquer host estático
funciona sem configuração extra.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | dev server com hot reload (Vite) |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm run preview` | serve o build `dist/` localmente |
| `npm run lint` | ESLint (config em `eslint.config.js`) |
| `npm run typecheck` | verificação de tipos (`tsc -b`, sem emitir) |
| `npm run test` | Playwright: desktop **e** mobile |
| `npm run test:e2e` | Playwright só no projeto `desktop` |
| `npm run test:mobile` | Playwright só no projeto `mobile` (viewport Pixel 5) |
| `npm run test:perf` | suíte de performance (3 min + memória) |
| `npm run report` | abre o relatório HTML da última execução |

Os testes sobem o preview sozinhos (`webServer` no `playwright.config.ts`:
`npm run build && npm run preview` na porta 4173) — de um checkout limpo basta
`npm ci && npx playwright install chromium && npm run test:e2e`.

## Controles

### Teclado

| Ação | Teclas |
| --- | --- |
| Avançar | `W` ou `↑` |
| Virar à esquerda | `A` ou `←` |
| Virar à direita | `D` ou `→` |
| Tiro frontal | `Espaço` ou `J` |
| Bordo esquerdo (3 projéteis) | `Q` ou `F` |
| Bordo direito (3 projéteis) | `E` ou `H` |
| Pausar / retomar | `P` ou `Esc` |

A pausa é automática ao perder o foco da janela/aba; ao retomar, as teclas que
continuam pressionadas não agem até serem soltas e pressionadas de novo (nada
de input acumulado). Durante a partida as teclas só são capturadas enquanto o
contexto de gameplay está ativo.

### Toque (dispositivos coarse-pointer)

Pads em tela: cluster esquerdo (virar à esquerda, avançar, virar à direita) e
cluster direito (bordo esquerdo, tiro frontal, bordo direito). Multi-touch por
dedo (cada pad captura seus próprios pointerIds) — dá para navegar e atirar ao
mesmo tempo. Em retrato aparece o aviso de girar o aparelho.

## Configuração de gameplay

Menu → **Options**:

- **Game session time:** duração da partida, 60–180 s (padrão 120).
- **Enemy spawn time:** intervalo entre spawns, 500–10000 ms (padrão 3000).

Os limites aparecem no próprio formulário; valores fora da faixa geram mensagem
de erro acessível (`role="alert"`) e mantêm o form aberto. As escolhas são
validadas e persistidas em `localStorage` (`pirate-battle.options`) e
sobrevivem a refresh; cada partida monta seu snapshot de configuração ao
começar, então mudanças só valem na próxima partida.

Outros dados locais: `pirate-battle.last-result` (card "Last match"),
`pirate-battle.player-id` / `player-name`, `pirate-battle.records` (registros
idempotentes) e `pirate-battle.pending-registrations` (fila que sobrevive a
refresh/offline).

## Cenários de rede (MSW)

No menu, bloco **Network scenarios (mock API)** (abaixo das abas):

- **Scenario** — um dos 13 cenários abaixo;
- **Seed** — semente do PRNG (fixtures e atrasos "aleatórios" ficam
  determinísticos, padrão `1337`);
- **Latency override (ms)** — força um atraso fixo (vazio = cenário);
- **Reset state** — limpa cenário/seed/latência, devolve os records às
  fixtures e esvazia a fila de registros pendentes.

Também dá para fixar tudo pela URL antes de abrir o jogo:

```
/?scenario=register-timeout&seed=42&latency=0
```

| id (`?scenario=`) | Comportamento |
| --- | --- |
| `success` | respostas normais (padrão) |
| `empty` | ranking e histórico vazios |
| `multi-page` | fixtures grandes, várias páginas nas duas abas |
| `slow` | cada resposta leva ~1,8 s |
| `variable-latency` | atraso aleatório com seed (150–1400 ms) |
| `out-of-order` | páginas ímpares lentas; respostas atrasadas chegam por último |
| `timeout` | consultas nunca respondem dentro do budget do cliente (3 s) |
| `network-error` | falha de conexão em tudo |
| `server-error` | GET responde 500, registro é rejeitado com 422 |
| `ranking-unavailable` | ranking 503, histórico funciona |
| `history-unavailable` | histórico 503, ranking funciona |
| `register-timeout` | o registro é gravado, mas a resposta chega após o timeout do cliente |
| `offline-at-end` | conexão cai no fim da partida |

### Como reproduzir falhas

1. **Registro pendente que se recupera:** scenario `network-error` → jogar até
   o fim → o resultado entra na fila (aviso "waiting to register") → refresh →
   fila intacta → troque para `success` → recarregue: tudo registra **uma
   vez** (idempotência pelo id gerado no cliente).
2. **Timeout no registro:** `?scenario=register-timeout` → fim de partida →
   estado "Registration failed — it stays queued" → clicar **Retry
   registration** → responde rápido (o record já existe) e não duplica.
3. **Offline no fim da partida:** `offline-at-end` → fim → falha → voltar para
   `success` e usar **Retry registration**.
4. **Resposta atrasada nunca sobrescreve a página atual:** `out-of-order` →
   abas paginadas (página 3 responde rápido, a resposta lenta da página 1/2
   chega depois e é descartada).
5. **Erro numa das abas:** `ranking-unavailable` → aba Ranking mostra erro com
   botão de retry enquanto Match History segue normal (e vice-versa).
6. **Vazio/loading:** `empty` (lista vazia) e `slow` (estado de carregamento).
7. **Consulta que nunca responde:** `timeout` → a aba esgota as tentativas de
   retry do TanStack Query e mostra erro com botão de retry.

## Testes (Playwright)

```bash
npm run test:e2e     # desktop (63 testes)
npm run test:mobile  # mobile
npm run test         # os dois projetos
```

- **Relatórios:** HTML em `reports/playwright-report/` (`npm run report`),
  resultados estruturados em `reports/results.json`.
- **Traces e screenshots:** em falha, `test-results/<caso>/trace.zip` (abrir com
  `npx playwright show-trace <arquivo>`).
- **Regressão visual:** `tests/e2e/visual.spec.ts` compara menu, arena em estado
  estável e tela de resultado contra baselines versionadas em
  `tests/e2e/visual.spec.ts-snapshots/`. Após mudança visual intencional:
  `npx playwright test --project=desktop --grep "main menu" --update-snapshots`
  (revisar o diff antes de commitar).
- **Reproduzir um teste só:**
  `npm run test:e2e -- --grep "nome do teste"`; relatório com
  `npm run test:e2e -- --reporter=list`.
- **Isolamento:** cada teste abre contexto/próprio `localStorage`; cenário e
  seed são fixados por teste; a suíte roda contra o **build de produção**
  (mesma condição do deploy).
- **Instrumentação de teste:** `window.__pirateBattle`
  (`simulation`, `input`, `renderer`, `app`) observa estado e injeta inputs,
  `window.__pirateBattleNet` controla cenário/seed/latência. Os testes de
  combate acionam os controles reais do jogo (nunca aplicam dano direto na
  simulação) e as regras, colisões e renderização seguem rodando de verdade.

Suítes: navegação/opções (01), assets com falha e retry (02), movimento e
arena (03), armas/cooldown/pontuação (04), inimigos e spawn (05), fim de
partida (06), pausa/foco (07), resultado e persistência (08), abandono/navegação
e toque (09), abas com loading/vazio/erro/paginação (10), registro e fila
pendente (11), retries idempotentes e respostas fora de ordem (12) e regressão
visual.

## Performance

```bash
npm run test:perf
```

Roda contra o build otimizado e escreve em `reports/`:

- `performance.md` / `performance.json` — FPS médio, p95 do tempo entre
  quadros e pico de entidades em uma partida real de 3 minutos; memória após
  5 ciclos de iniciar → jogar → sair (procura crescimento contínuo de
  recursos), além de hardware, navegador, resolução, configuração usada e
  limitações observadas.

## Deploy

O `dist/` é estático (React + Pixi + MSW worker em `public/`): funciona em
Vercel, Netlify ou Cloudflare Pages sem variáveis de ambiente.

```bash
npm run build   # publicar dist/
```

**URL pública:** _a preencher na publicação (obrigatória para a entrega)._

## Scripts de debug

Nenhum script avulso é necessário para rodar/validar o projeto — tudo passa
pelos comandos da tabela acima e pelas suítes em `tests/`.
