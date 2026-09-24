import fs from 'node:fs'
import webpush from 'web-push'
import { soIda } from './serpapi.js'

const cfg = JSON.parse(fs.readFileSync('config.json'))
const hist = JSON.parse(fs.readFileSync('prices.json'))

// ida e volta como dois trechos só de ida, pra saber o preço de cada um
const chave = process.env.SERPAPI_KEY
const [ida, volta] = await Promise.all([
  soIda(cfg.origem, cfg.destino, cfg.ida, chave),
  cfg.volta ? soIda(cfg.destino, cfg.origem, cfg.volta, chave) : null,
])
if (!ida.voos.length || (volta && !volta.voos.length)) { console.log('nenhum voo encontrado'); process.exit(0) }
const trecho = r => r && { price: r.voos[0].preco, cia: r.voos[0].cia, url: r.url }
const e = { t: new Date().toISOString(), ida: trecho(ida), volta: trecho(volta) }
e.price = e.ida.price + (e.volta?.price ?? 0)

const last = hist.at(-1)?.price
hist.push({ t: e.t, price: e.price, ida: e.ida, ...(e.volta && { volta: e.volta }) })
fs.writeFileSync('prices.json', JSON.stringify(hist, null, 1))
const detalhe = `ida R$ ${e.ida.price} na ${e.ida.cia}` + (e.volta ? `, volta R$ ${e.volta.price} na ${e.volta.cia}` : '')
console.log(`${cfg.origem}⇄${cfg.destino}: R$ ${e.price} (${detalhe}; anterior: ${last ?? '-'})`)

// só avisa se está abaixo do limite E caiu desde a última checagem
if (e.price <= cfg.precoMax && e.price < (last ?? Infinity) && process.env.PUSH_SUB) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, cfg.vapidPublicKey, process.env.VAPID_PRIVATE)
  await webpush.sendNotification(JSON.parse(process.env.PUSH_SUB), JSON.stringify({
    title: `✈️ ${cfg.origem}⇄${cfg.destino} por R$ ${e.price}`,
    body: (last ? `Caiu de R$ ${last}. ` : `Abaixo do seu limite de R$ ${cfg.precoMax}. `) + detalhe[0].toUpperCase() + detalhe.slice(1) + '.',
    url: e.ida.url,
  }))
  console.log('push enviado')
}
