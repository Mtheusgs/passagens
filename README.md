# Passagens

PWA que acompanha o preço de uma passagem de ida e volta no Google Flights e manda uma notificação no celular quando ele fica abaixo do seu limite.

A rota configurada hoje é **Boa Vista (BVB) ⇄ Belo Horizonte (CNF)**, com ida em 7/fev/2027 e volta em 14/fev/2027.

O app **não tem servidor próprio nem banco de dados**:
- o **GitHub Actions** faz a busca uma vez por dia;
- o **próprio repositório** guarda o histórico de preços;
- a **Vercel** publica o site e três funções pequenas.

Com o plano grátis da SerpApi, da Vercel e do GitHub, o custo é zero.

## O que o app faz

- **Mostra o preço de hoje** da ida e da volta, com a companhia de cada trecho e o total somado. O avião voa de uma cidade até a outra ao abrir o app.
- **Diz quanto falta** pra chegar no seu limite, ou quanto o preço já está abaixo dele.
- **Guarda um histórico** com gráfico e a lista das últimas checagens: quanto subiu ou caiu, companhia e link pra cada trecho.
- **Notifica no celular** quando ida e volta somadas ficam abaixo do limite **e** o preço caiu desde a checagem anterior. Isso evita repetir o mesmo aviso.
- **Busca na hora** pelo botão **Buscar agora**, sem esperar a checagem diária.
- **Busca outra viagem**: qualquer origem, destino e datas de ida e volta. Mostra a combinação mais barata e as listas de voos de ida e de volta, com horários, escalas e se o preço está baixo, normal ou alto pra aquele trecho.
- **Muda o limite** direto pelo app.
- **Instala como app** no Android e no iPhone.

## Como funciona

```
                 todo dia às 12h UTC (8h em Boa Vista)
                 ou pelo botão "Buscar agora"
                              │
                              ▼
┌──────────────────── GitHub Actions ─────────────────────┐
│ check.mjs                                               │
│  1. busca a ida e a volta na SerpApi (Google Flights)   │
│  2. adiciona o resultado ao prices.json                 │
│  3. se ficou abaixo do limite e caiu → notificação push │
│  4. faz commit do prices.json                           │
└────────────────────────────┬────────────────────────────┘
                             │ o commit dispara um deploy
                             ▼
┌───────────────────────── Vercel ────────────────────────┐
│ index.html   o app (lê config.json e prices.json)       │
│ api/limite   grava o novo limite no config.json         │
│ api/buscar   dispara o workflow do GitHub na hora       │
│ api/voos     busca avulsa de outra viagem na SerpApi    │
└─────────────────────────────────────────────────────────┘
```

Ida e volta são buscadas como **dois trechos só de ida**. O Google Flights dá um preço único pra ida e volta, e buscando separado dá pra saber quanto custa cada trecho. Por isso cada checagem gasta **2 buscas** da SerpApi.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O app inteiro: HTML, CSS e JavaScript, sem framework e sem build |
| `sw.js` | Service worker: recebe o push e mostra a notificação |
| `manifest.json`, `icon*.png`, `icon.svg`, `apple-touch-icon.png` | O que faz o site virar um app instalável |
| `config.json` | Rota, datas, limite de preço e chave pública dos avisos |
| `prices.json` | Histórico de preços, atualizado pelo workflow |
| `serpapi.js` | Busca de um trecho só de ida na SerpApi, usada pelo `check.mjs` e pelo `api/voos.js` |
| `check.mjs` | A checagem: busca, grava no histórico e notifica |
| `.github/workflows/check.yml` | Agenda a checagem e faz o commit do resultado |
| `api/limite.js` | Função da Vercel que muda o `precoMax` no `config.json` |
| `api/buscar.js` | Função da Vercel que dispara o workflow na hora |
| `api/voos.js` | Função da Vercel da busca avulsa |

### `config.json`

```json
{
  "origem": "BVB",                 // código IATA do aeroporto de saída
  "origemNome": "Boa Vista",       // nome que aparece no app
  "destino": "CNF",
  "destinoNome": "Belo Horizonte",
  "ida": "2027-02-07",             // AAAA-MM-DD
  "volta": "2027-02-14",           // apague esta linha pra acompanhar só ida
  "precoMax": 1100,                // limite pra ida + volta somadas, em reais
  "vapidPublicKey": "..."          // chave pública dos avisos (não é segredo)
}
```

Pra trocar a rota ou as datas, edite este arquivo (dá pra fazer pelo próprio site do GitHub). Se trocar a rota, zere o histórico colocando `[]` no `prices.json`, pra não misturar preços de viagens diferentes.

### `prices.json`

Uma lista em ordem de data. Cada checagem fica assim:

```json
{
  "t": "2026-09-24T12:00:00.000Z",
  "price": 1295,
  "ida":   { "price": 640, "cia": "Gol",   "url": "https://www.google.com/travel/flights?..." },
  "volta": { "price": 655, "cia": "LATAM", "url": "https://www.google.com/travel/flights?..." }
}
```

As primeiras checagens, de antes de ida e volta serem separadas, têm só `price` com o valor de ida e volta juntos e, em alguns casos, `cia` e `url`. O app mostra as duas versões.

## Configuração do zero

Tudo isso já está feito para o repositório atual. Esta seção serve pra recriar o projeto do zero ou lembrar onde fica cada coisa.

### 1. SerpApi

1. Crie uma conta em [serpapi.com](https://serpapi.com). O plano grátis dá 100 buscas por mês.
2. Copie a chave em [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key).

### 2. Chaves dos avisos (VAPID)

```bash
npm install
npx web-push generate-vapid-keys
```

- A **pública** vai no `vapidPublicKey` do `config.json`.
- A **privada** vira o secret `VAPID_PRIVATE` do GitHub. Nunca faça commit dela. O `.gitignore` já ignora o arquivo `VAPID_PRIVATE.txt`, caso você guarde a chave nele.

### 3. Secrets do GitHub

Em **Settings → Secrets and variables → Actions**, crie:

| Secret | Valor |
|---|---|
| `SERPAPI_KEY` | A chave da SerpApi |
| `VAPID_PRIVATE` | A chave privada do passo 2 |
| `PUSH_SUB` | O código gerado no celular (veja o passo 6) |

Pra conferir se está tudo certo, abra **Actions → check → Run workflow**.

### 4. Token do GitHub para a Vercel

As funções da Vercel precisam de permissão pra gravar no repositório e disparar o workflow.

1. Abra [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. Em **Repository access**, escolha "Only select repositories" e selecione este repositório.
3. Em **Permissions → Repository permissions**, coloque:
   - **Actions:** Read and write, usada pelo Buscar agora.
   - **Contents:** Read and write, usada pra salvar o limite.
4. Escolha uma data de validade depois da viagem e gere o token. Ele começa com `github_pat_`.

### 5. Vercel

1. Importe o repositório em [vercel.com](https://vercel.com). Não precisa configurar build.
2. Em **Settings → Environment Variables**, cadastre:

| Variável | Valor |
|---|---|
| `GITHUB_TOKEN` | O token do passo 4 |
| `SERPAPI_KEY` | A mesma chave da SerpApi |

3. Depois de cadastrar ou mudar variáveis, faça **Redeploy**. A Vercel só lê as variáveis num deploy novo.

As funções descobrem o repositório sozinhas, pelas variáveis automáticas `VERCEL_GIT_REPO_OWNER` e `VERCEL_GIT_REPO_SLUG`.

### 6. Avisos no celular

1. Abra o site no celular e instale o app:
   - **Android** (Chrome): menu ⋮ → Instalar app.
   - **iPhone** (Safari): Compartilhar → Adicionar à Tela de Início. No iPhone o push só funciona com o app instalado, no iOS 16.4 ou mais novo.
2. Abra o app pelo ícone, vá em **Ajustes → Ativar avisos** e permita as notificações.
3. Toque em **Copiar código** e salve o código como o secret `PUSH_SUB` do GitHub.

## Cota da SerpApi

| O que | Buscas |
|---|---|
| Checagem automática, 1 por dia, ida + volta | ~60 por mês |
| Cada toque em **Buscar agora** | 2 |
| Cada **busca de outra viagem** | 2 |
| **Total grátis por mês** | 100 |

Se a cota acabar, as buscas falham até o mês virar. Pra gastar menos, espace a agenda no `.github/workflows/check.yml` (por exemplo `'0 12 */2 * *'`, de 2 em 2 dias). Se mudar o horário, ajuste também a função `rodape()` do `index.html`, que mostra quando é a próxima busca.

## Rodando no computador

Precisa do Node 20 ou mais novo.

```bash
npm install

# faz uma checagem de verdade (gasta 2 buscas) e grava no prices.json
echo "SERPAPI_KEY=sua_chave" > .env
node --env-file=.env check.mjs

# abre o app em http://localhost:8000 (as funções /api só rodam na Vercel ou com `npx vercel dev`)
python3 -m http.server 8000
```

O `.env` está no `.gitignore` e nunca vai pro GitHub.

## Limitações

- **Avisos em um aparelho só.** Os avisos vão só pro aparelho cadastrado no `PUSH_SUB`. Se ativar os avisos em outro aparelho, o novo código substitui o antigo.
- **Sem senha.** Quem tiver o link consegue mudar o limite e usar o Buscar agora, o que gasta a cota. O Buscar agora recusa um novo pedido se já teve uma busca nos últimos 2 minutos.
- **Link é da busca, não do voo.** Os links abrem a busca no Google Flights, não o voo específico. Pegar o link de reserva de cada voo gastaria uma busca a mais por voo.
- **Checagem pode atrasar.** O GitHub pode atrasar agendas em 10 a 30 minutos nos horários de pico.
- **Preços por pessoa**, em reais, na classe econômica.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "O GitHub não deixou ler o config.json (401)" | `GITHUB_TOKEN` errado, vencido ou cadastrado sem Redeploy na Vercel |
| Buscar agora responde 403 ou 404 | Falta a permissão **Actions: Read and write** no token |
| Busca avulsa falha com "Invalid API key" | `SERPAPI_KEY` não cadastrada na Vercel, ou cadastrada sem Redeploy |
| Checagem roda mas nenhum preço novo aparece no app | O deploy da Vercel ainda não terminou (leva cerca de 30 s depois do commit) |
| Nunca chega notificação | Falta o secret `PUSH_SUB`, as notificações estão bloqueadas no celular, ou o preço não ficou abaixo do limite **e** caiu |
| Botão Ativar avisos não aparece no iPhone | O app precisa ser aberto pelo ícone da tela de início, não pelo Safari |
