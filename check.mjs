import fs from 'node:fs'
import webpush from 'web-push'

const cfg = JSON.parse(fs.readFileSync('config.json'))
const hist = JSON.parse(fs.readFileSync('prices.json'))

const q = new URLSearchParams({
  engine: 'google_flights', departure_id: cfg.origem, arrival_id: cfg.destino,
  outbound_date: cfg.ida, currency: 'BRL', hl: 'pt', gl: 'br', api_key: process.env.SERPAPI_KEY,
  ...(cfg.volta ? { return_date: cfg.volta, type: '1' } : { type: '2' }),
})
const d = await (await fetch('https://serpapi.com/search.json?' + q)).json()
if (d.error) throw new Error(d.error)

const prices = [...(d.best_flights ?? []), ...(d.other_flights ?? [])].map(f => f.price).filter(Boolean)
if (!prices.length) { console.log('nenhum voo encontrado'); process.exit(0) }
const price = Math.min(...prices)
const last = hist.at(-1)?.price
hist.push({ t: new Date().toISOString(), price })
fs.writeFileSync('prices.json', JSON.stringify(hist, null, 1))
console.log(`${cfg.origem}→${cfg.destino}: R$ ${price} (anterior: ${last ?? '-'})`)

// só avisa se está abaixo do limite E caiu desde a última checagem (evita spam a cada 8h)
if (price <= cfg.precoMax && price < (last ?? Infinity) && process.env.PUSH_SUB) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, cfg.vapidPublicKey, process.env.VAPID_PRIVATE)
  await webpush.sendNotification(JSON.parse(process.env.PUSH_SUB), JSON.stringify({
    title: `✈️ ${cfg.origem}→${cfg.destino} por R$ ${price}`,
    body: last ? `Caiu de R$ ${last}` : `Abaixo do seu limite de R$ ${cfg.precoMax}`,
    url: `https://www.google.com/travel/flights?q=Flights+to+${cfg.destino}+from+${cfg.origem}+on+${cfg.ida}` +
      (cfg.volta ? `+returning+${cfg.volta}` : ''),
  }))
  console.log('push enviado')
}
