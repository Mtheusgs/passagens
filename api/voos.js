// Busca avulsa: ida e volta como dois trechos só de ida (2 buscas). Não mexe na viagem acompanhada.
import { soIda } from '../serpapi.js'
import { erroViagem, cota, gastou, falha, erro } from '../dados.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const v = req.body ?? {}
    const e = erroViagem(v)
    if (e) throw erro(400, e)
    const c = await cota(true)
    if (c.restantes < 2) throw erro(429, `As buscas grátis acabaram. Elas renovam em ${new Date(c.renova + 'T12:00').toLocaleDateString('pt-BR')}.`)
    const chave = process.env.SERPAPI_KEY
    const [i, vo] = await Promise.all([soIda(v.origem, v.destino, v.ida, chave), soIda(v.destino, v.origem, v.volta, chave)]).finally(gastou)
    const corta = r => ({ ...r, voos: r.voos.slice(0, 8) })
    res.json({ ida: corta(i), volta: corta(vo) })
  } catch (err) { falha(res, err.status ? err : erro(502, 'A busca falhou: ' + err.message)) }
}
