# Passagens

PWA que acompanha o preço de passagens de ida e volta no Google Flights e manda uma notificação no celular quando ele fica abaixo do seu limite.

**Cada aparelho tem a própria viagem, o próprio limite e os próprios avisos.** Não tem login: na primeira abertura o app gera um código pro aparelho e guarda nele. Aparelhos que escolhem a mesma viagem (mesma origem, destino e datas) dividem as buscas e o histórico.

O custo é zero, usando o plano grátis de todos os serviços:
- **Vercel** publica o app, roda as funções e guarda os dados num Upstash Redis;
- **SerpApi** faz as buscas no Google Flights;
- **GitHub Actions** chama o app de hora em hora pra ele decidir se é hora de buscar.

## O que o app faz

- **Escolher a viagem**: origem, destino, ida, volta e limite. Dá pra trocar quando quiser em Ajustes.
- **Mostrar o preço de hoje** da ida e da volta, com a companhia de cada trecho e o total. O avião voa de uma cidade até a outra ao abrir o app.
- **Dizer quanto falta** pra chegar no limite, ou quanto já está abaixo dele.
- **Guardar o histórico** com gráfico e as últimas checagens: quanto subiu ou caiu, companhia e link pra cada trecho.
- **Avisar no celular** quando ida e volta somadas ficam abaixo do limite **e** o preço caiu desde a checagem anterior.
- **Buscar agora**: checa na hora e mostra o resultado em segundos.
- **Buscar outra viagem**: busca avulsa com a combinação mais barata, os voos de ida e de volta, horários, escalas e se o preço está baixo, normal ou alto. O botão **Acompanhar esta viagem** transforma a busca na viagem do aparelho.
- **Instalar como app** no Android e no iPhone.

## Como funciona

```
 GitHub Actions ── de hora em hora ──▶ /api/cron
                                          │
                                          │ 1. consulta quantas buscas restam na SerpApi (não gasta cota)
                                          │ 2. calcula quantas checagens cabem até a cota renovar
                                          │ 3. checa as viagens que estão há mais tempo sem checagem
                                          │ 4. avisa os aparelhos cujo limite foi atingido
                                          ▼
 ┌──────────────── Vercel ────────────────────────────────────────┐
 │ index.html     o app                                           │
 │ api/eu         lê e muda a viagem, o limite e os avisos        │
 │ api/buscar     Buscar agora                                    │
 │ api/voos       busca avulsa de outra viagem                    │
 │ api/cron       checagem automática                             │
 │                                                                │
 │ Upstash Redis  disp:<id>     viagem, limite e aviso do aparelho│
 │                rota:<chave>  dados e histórico de uma viagem   │
 └────────────────────────────────────────────────────────────────┘
```

### Quantas vezes por dia ele busca

Cada checagem de ida e volta gasta **2 buscas**, porque os dois trechos são buscados separados pra saber o preço de cada um. O plano grátis da SerpApi dá **250 buscas por mês**.

O app divide a cota entre as viagens sozinho:

- A cada hora, ele vê quantas buscas restam e quantas horas faltam pra cota renovar.
- **20 buscas ficam guardadas** pro Buscar agora e pra busca avulsa.
- O resto é distribuído por igual até a renovação.
- Cada viagem é checada **no máximo 6 vezes por dia**, uma a cada 4 horas.

| Viagens diferentes acompanhadas | Checagens por dia, cada uma (plano grátis) |
|---|---|
| 1 | cerca de 3 a 4 |
| 2 | cerca de 2 |
| 3 | cerca de 1 |
| 5 | quase 1 |

O rodapé do app mostra a frequência atual e quantas buscas restam. Com um plano pago da SerpApi, o mesmo cálculo chega sozinho no teto de 6 por dia, sem mudar nada no código.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro: HTML, CSS e JavaScript, sem framework e sem build |
| `sw.js` | Service worker: recebe o push e mostra a notificação |
| `manifest.json`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` | O que faz o site virar um app instalável |
| `dados.js` | Banco (Redis), aparelhos, viagens, cálculo da cota, checagem e avisos |
| `serpapi.js` | Busca de um trecho só de ida e consulta da cota na SerpApi |
| `api/eu.js` | Lê (`GET ?id=`) e muda (`POST`) a viagem, o limite e os avisos do aparelho |
| `api/buscar.js` | Buscar agora |
| `api/voos.js` | Busca avulsa |
| `api/cron.js` | Checagem automática, protegida pelo `CRON_SECRET` |
| `vercel.json` | Tempo máximo das funções e inclusão do `legado.json` |
| `.github/workflows/check.yml` | Chama o `/api/cron` de hora em hora |
| `legado.json` | Histórico de BVB ⇄ CNF de antes de o app ter vários aparelhos. Vira o histórico inicial dessa viagem |

### Como os dados ficam no Redis

```jsonc
// disp:<código do aparelho>
{ "id": "…", "rota": "BVB-CNF-2027-02-07-2027-02-14", "precoMax": 1100, "push": { /* inscrição de avisos */ }, "criado": "…" }

// rota:<origem>-<destino>-<ida>-<volta>
{
  "chave": "BVB-CNF-2027-02-07-2027-02-14",
  "origem": "BVB", "origemNome": "Boa Vista", "destino": "CNF", "destinoNome": "Belo Horizonte",
  "ida": "2027-02-07", "volta": "2027-02-14",
  "ultima": "2026-09-24T12:00:00.000Z",
  "hist": [
    { "t": "…", "price": 1295,
      "ida":   { "price": 640, "cia": "Gol",   "url": "https://www.google.com/travel/flights?…" },
      "volta": { "price": 655, "cia": "LATAM", "url": "…" } }
  ]
}
```

Também ficam guardados `disps` (a lista de aparelhos), `cota` (resposta da SerpApi, guardada por 10 minutos) e `credito` (frações de checagem que vão se acumulando de uma hora pra outra). O histórico guarda as últimas 500 checagens de cada viagem.

## Configuração do zero

### 1. SerpApi

1. Crie uma conta em [serpapi.com](https://serpapi.com).
2. Copie a chave em [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key).

### 2. Chaves dos avisos (VAPID)

```bash
npm install
npx web-push generate-vapid-keys
```

- A **pública** vai na constante `VAPID_PUBLICA` do `dados.js`. Ela não é segredo.
- A **privada** vira a variável `VAPID_PRIVATE` da Vercel. Nunca faça commit dela. O `.gitignore` já ignora o arquivo `VAPID_PRIVATE.txt`, caso você guarde a chave nele.

Se trocar as chaves, todos os aparelhos precisam ativar os avisos de novo.

### 3. Senha do agendamento

```bash
openssl rand -hex 24
```

O mesmo valor vai em dois lugares: no secret `CRON_SECRET` do GitHub (Settings → Secrets and variables → Actions) e na variável `CRON_SECRET` da Vercel. Sem ele, ninguém consegue chamar o `/api/cron` de fora.

### 4. Vercel

1. Importe o repositório em [vercel.com](https://vercel.com). Não precisa configurar build.
2. **Banco:** em **Storage → Create Database**, escolha **Upstash → Redis** (plano grátis) e conecte ao projeto. Isso cria sozinho as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
3. Em **Settings → Environment Variables**, cadastre:

| Variável | Valor |
|---|---|
| `SERPAPI_KEY` | A chave da SerpApi |
| `VAPID_PRIVATE` | A chave privada dos avisos |
| `CRON_SECRET` | A senha do agendamento |

4. Faça **Redeploy**. A Vercel só lê variáveis novas num deploy novo.

Se o endereço do app mudar, atualize a URL no `.github/workflows/check.yml`.

### 5. Em cada celular

1. Abra o site e instale o app:
   - **Android** (Chrome): menu ⋮ → Instalar app.
   - **iPhone** (Safari): Compartilhar → Adicionar à Tela de Início. No iPhone o push só funciona com o app instalado, no iOS 16.4 ou mais novo.
2. Abra pelo ícone, escolha a viagem e o limite.
3. Em **Ajustes → Avisos neste aparelho**, toque em **Ativar avisos**.

## Rodando no computador

Precisa do Node 20 ou mais novo. As funções precisam das mesmas variáveis da Vercel. O jeito mais simples é o `vercel dev`, que baixa as variáveis do projeto:

```bash
npm install
npx vercel link       # uma vez só, liga a pasta ao projeto da Vercel
npx vercel env pull   # baixa as variáveis pro .env.local
npx vercel dev        # app e funções em http://localhost:3000
```

Pra rodar uma checagem na mão, igual à automática:

```bash
curl -H "Authorization: Bearer $(cat CRON_SECRET.txt)" https://passagens-phi.vercel.app/api/cron
```

## Limitações

- **O código do aparelho fica no navegador.** Se você limpar os dados do site ou reinstalar o app, ele vira um aparelho novo e pede a viagem de novo. O histórico da viagem continua lá, e volta ao escolher a mesma viagem.
- **Sem senha.** Qualquer pessoa com o link pode criar um aparelho e usar o Buscar agora, que gasta a cota. Cada viagem só pode ser checada de novo depois de 2 minutos, e o app recusa buscas quando a cota acaba.
- **Link é da busca, não do voo.** Os links abrem a busca no Google Flights, não o voo específico.
- **Preços por pessoa**, em reais, na classe econômica.
- **Agendamento pode atrasar.** O GitHub pode atrasar agendas em 10 a 30 minutos nos horários de pico. Num repositório **público**, ele desativa o agendamento depois de 60 dias sem commits. Neste repositório, que é privado, isso não acontece.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Banco de dados não configurado" | O Upstash Redis não foi conectado ao projeto, ou faltou o Redeploy depois |
| O workflow `check` falha com erro 401 | O `CRON_SECRET` do GitHub e o da Vercel estão diferentes, ou a Vercel não foi reimplantada |
| Buscas falham com "Invalid API key" | `SERPAPI_KEY` errada ou não cadastrada na Vercel |
| "As buscas grátis acabaram" | A cota do mês da SerpApi acabou. Ela renova na data que aparece na mensagem |
| Nunca chega notificação | Os avisos não foram ativados nesse aparelho, as notificações estão bloqueadas, falta o `VAPID_PRIVATE` na Vercel, ou o preço não ficou abaixo do limite **e** caiu |
| Botão Ativar avisos some no iPhone | O app precisa ser aberto pelo ícone da tela de início, não pelo Safari |
