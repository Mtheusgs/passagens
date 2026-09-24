// Aparelhos, viagens e cota, guardados no Upstash Redis que a Vercel conecta ao projeto.
import fs from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'
import { soIda, cota as cotaSerpApi } from './serpapi.js'

export const VAPID_PUBLICA = 'BL8m9xfo8pcTbuPSnCO8xDugqMUezGG9Wq7VYzhQag3KhuR5QVkeEHHrnhjVhX8Qz1GZ7FMkk-SmcZEKEeWMDJ0'
export const RESERVA = 20              // buscas guardadas pro Buscar agora e pra busca avulsa
export const INTERVALO_MIN = 4 * 36e5  // no máximo 6 checagens por dia por viagem

// aceita as variáveis com ou sem prefixo (ex.: STORAGE_KV_REST_API_URL), do jeito que a Vercel criar
const variavel = (...fins) => Object.keys(process.env).find(k => fins.some(f => k.endsWith(f)) && !k.includes('READ_ONLY'))
const URL_REDIS = process.env[variavel('KV_REST_API_URL', 'REDIS_REST_URL')]
const TOKEN_REDIS = process.env[variavel('KV_REST_API_TOKEN', 'REDIS_REST_TOKEN')]

export async function redis(...cmd) {
  if (!URL_REDIS || !TOKEN_REDIS) {
    const achadas = Object.keys(process.env).filter(k => /REDIS|KV_|UPSTASH/.test(k))
    throw new Error('Banco de dados não configurado. Conecte o Upstash Redis ao projeto na Vercel e faça Redeploy. '
      + (achadas.length ? `Variáveis de banco encontradas: ${achadas.join(', ')}.` : 'Nenhuma variável de banco encontrada.'))
  }
  const r = await fetch(URL_REDIS, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN_REDIS}` }, body: JSON.stringify(cmd) })
  const d = await r.json()
  if (d.error) throw new Error('Banco de dados: ' + d.error)
  return d.result
}
const ler = async k => JSON.parse((await redis('GET', k)) ?? 'null')
const gravar = (k, v) => redis('SET', k, JSON.stringify(v))

// ---------- aparelhos ----------
export const idValido = id => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id)
export const lerDisp = id => ler('disp:' + id)
export async function gravarDisp(d) {
  await gravar('disp:' + d.id, d)
  await redis('SADD', 'disps', d.id)
}
export async function todosDisps() {
  const ids = await redis('SMEMBERS', 'disps')
  return (await Promise.all(ids.map(lerDisp))).filter(Boolean)
}

// ---------- viagens ----------
const iata = /^[A-Z]{3}$/, data = /^\d{4}-\d{2}-\d{2}$/
export const hoje = () => new Date().toISOString().slice(0, 10)
export function erroViagem({ origem, destino, ida, volta }) {
  if (!iata.test(origem) || !iata.test(destino)) return 'Escolha a origem e o destino na lista de aeroportos.'
  if (origem === destino) return 'A origem e o destino são o mesmo aeroporto.'
  if (!data.test(ida) || !data.test(volta)) return 'Preencha as datas de ida e volta.'
  if (volta < ida) return 'A volta precisa ser depois da ida.'
  if (ida < hoje()) return 'A data de ida já passou.'
  return null
}
export const chaveRota = r => [r.origem, r.destino, r.ida, r.volta].join('-')
export const lerRota = chave => ler('rota:' + chave)
const gravarRota = r => gravar('rota:' + r.chave, r)
const custo = r => (r.volta ? 2 : 1)

// histórico de antes de o app ter vários aparelhos
const LEGADO = 'BVB-CNF-2027-02-07-2027-02-14'

export async function criarRota(v) {
  const chave = chaveRota(v)
  const existente = await lerRota(chave)
  if (existente) return existente
  let hist = []
  if (chave === LEGADO) try { hist = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'legado.json'), 'utf8')) } catch {}
  const nome = (n, c) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 60) : c)
  const r = { chave, origem: v.origem, origemNome: nome(v.origemNome, v.origem), destino: v.destino, destinoNome: nome(v.destinoNome, v.destino),
    ida: v.ida, volta: v.volta, hist, ultima: hist.at(-1)?.t ?? null }
  await gravarRota(r)
  return r
}

// viagens que algum aparelho acompanha e que ainda não passaram
export async function rotasAtivas(disps) {
  const chaves = [...new Set(disps.map(d => d.rota).filter(Boolean))]
  return (await Promise.all(chaves.map(lerRota))).filter(r => r && r.ida >= hoje())
}

// ---------- cota ----------
// guardada por 10 min pra não consultar a SerpApi a cada abertura do app
export async function cota(fresca) {
  if (!fresca) { const c = await ler('cota'); if (c) return c }
  const c = await cotaSerpApi(process.env.SERPAPI_KEY)
  await redis('SET', 'cota', JSON.stringify(c), 'EX', 600)
  return c
}
export const gastou = () => redis('DEL', 'cota')

// quantas checagens cabem por hora até a cota renovar, divididas entre as viagens ativas
export function ritmo(c, rotas) {
  const horas = Math.max(1, (new Date(c.renova + 'T00:00:00Z') - Date.now()) / 36e5)
  const custoMedio = rotas.length ? rotas.reduce((s, r) => s + custo(r), 0) / rotas.length : 2
  const porHora = Math.max(0, c.restantes - RESERVA) / custoMedio / horas
  const porDia = rotas.length ? Math.min(24 * 36e5 / INTERVALO_MIN, porHora * 24 / rotas.length) : 0
  return { porHora, porDia }
}

// ---------- checagem ----------
// ida e volta como dois trechos só de ida, pra saber o preço de cada um
export async function checarRota(r) {
  const chave = process.env.SERPAPI_KEY
  const [ida, volta] = await Promise.all([
    soIda(r.origem, r.destino, r.ida, chave),
    r.volta ? soIda(r.destino, r.origem, r.volta, chave) : null,
  ]).finally(gastou)
  r.ultima = new Date().toISOString()
  if (!ida.voos.length || (volta && !volta.voos.length)) { await gravarRota(r); return null }
  const trecho = x => x && { price: x.voos[0].preco, cia: x.voos[0].cia, escalas: x.voos[0].escalas, url: x.url }
  const e = { t: r.ultima, price: 0, ida: trecho(ida), ...(volta && { volta: trecho(volta) }) }
  e.price = e.ida.price + (e.volta?.price ?? 0)
  const anterior = r.hist.at(-1)?.price
  r.hist = [...r.hist, e].slice(-500)
  await gravarRota(r)
  await avisar(r, e, anterior)
  return e
}

// quem recebe aviso: aparelhos dessa viagem com avisos ligados, preço no limite e em queda
export const quemAvisar = (disps, r, e, anterior) =>
  e.price < (anterior ?? Infinity) ? disps.filter(d => d.rota === r.chave && d.push && e.price <= d.precoMax) : []

async function avisar(r, e, anterior) {
  const alvos = quemAvisar(await todosDisps(), r, e, anterior)
  if (!alvos.length) return
  webpush.setVapidDetails(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'vercel.app'}`, VAPID_PUBLICA, process.env.VAPID_PRIVATE)
  const detalhe = `Ida R$ ${e.ida.price} na ${e.ida.cia}` + (e.volta ? `, volta R$ ${e.volta.price} na ${e.volta.cia}` : '')
  const corpo = JSON.stringify({
    title: `✈️ ${r.origem}⇄${r.destino} por R$ ${e.price}`,
    body: (anterior ? `Caiu de R$ ${anterior}. ` : '') + detalhe + '.',
    url: '/',
  })
  await Promise.all(alvos.map(async d => {
    try { await webpush.sendNotification(d.push, corpo) }
    catch (err) {
      // inscrição vencida ou cancelada no aparelho: para de tentar
      if ([404, 410].includes(err.statusCode)) { d.push = null; await gravarDisp(d) }
    }
  }))
}

// ---------- o que o app recebe ----------
export async function estado(id) {
  const [d, disps] = await Promise.all([lerDisp(id), todosDisps()])
  const [c, rotas, r] = await Promise.all([cota().catch(() => null), rotasAtivas(disps), d?.rota ? lerRota(d.rota) : null])
  return {
    vapid: VAPID_PUBLICA,
    disp: d && { precoMax: d.precoMax, avisos: !!d.push },
    rota: r,
    cota: c && { restantes: c.restantes, renova: c.renova, viagens: rotas.length, porDia: ritmo(c, rotas).porDia },
  }
}

// respostas de erro no mesmo formato em todas as funções
export const falha = (res, err) => res.status(err.status ?? 502).json({ erro: err.message })
export const erro = (status, message) => Object.assign(new Error(message), { status })
