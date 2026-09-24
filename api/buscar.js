// Buscar agora: checa a viagem do aparelho na hora e devolve o estado atualizado.
import { idValido, lerDisp, lerRota, checarRota, cota, estado, falha, erro } from '../dados.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const id = req.body?.id
    if (!idValido(id)) throw erro(400, 'Aparelho sem identificação. Recarregue o app.')
    const d = await lerDisp(id)
    const r = d?.rota && await lerRota(d.rota)
    if (!r) throw erro(400, 'Escolha uma viagem antes de buscar.')
    // segura toque duplo: cada checagem gasta 2 buscas da cota
    if (r.ultima && Date.now() - new Date(r.ultima) < 2 * 60e3) throw erro(429, 'Essa viagem acabou de ser checada. Tente de novo em 2 minutos.')
    const c = await cota(true)
    if (c.restantes < (r.volta ? 2 : 1)) throw erro(429, `As buscas grátis acabaram. Elas renovam em ${new Date(c.renova + 'T12:00').toLocaleDateString('pt-BR')}.`)
    await checarRota(r)
    res.json(await estado(id))
  } catch (err) { falha(res, err) }
}
