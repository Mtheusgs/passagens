// O aparelho: lê (GET ?id=) e muda (POST) a viagem, o limite e os avisos dele.
import { idValido, lerDisp, gravarDisp, criarRota, erroViagem, estado, falha, erro } from '../dados.js'

export default async function handler(req, res) {
  try {
    const id = req.method === 'GET' ? req.query.id : req.body?.id
    if (!idValido(id)) throw erro(400, 'Aparelho sem identificação. Recarregue o app.')
    if (req.method === 'GET') return res.json(await estado(id))
    if (req.method !== 'POST') return res.status(405).end()

    const { rota, precoMax, push } = req.body
    const d = (await lerDisp(id)) ?? { id, criado: new Date().toISOString(), precoMax: 1000, push: null, rota: null }
    if (rota !== undefined) {
      const e = erroViagem(rota ?? {})
      if (e) throw erro(400, e)
      d.rota = (await criarRota(rota)).chave
    }
    if (precoMax !== undefined) {
      const v = Math.round(Number(precoMax))
      if (!(v >= 100 && v <= 50000)) throw erro(400, 'Use um limite entre R$ 100 e R$ 50.000.')
      d.precoMax = v
    }
    if (push !== undefined) {
      const ok = push === null || (typeof push?.endpoint === 'string' && push.endpoint.startsWith('https://') && push.keys?.p256dh && push.keys?.auth)
      if (!ok) throw erro(400, 'Inscrição de avisos inválida.')
      d.push = push
    }
    await gravarDisp(d)
    res.json(await estado(id))
  } catch (err) { falha(res, err) }
}
