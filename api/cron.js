// Chamada de hora em hora pelo GitHub Actions. Decide quantas viagens checar pra cota durar até renovar.
import { todosDisps, rotasAtivas, cota, ritmo, checarRota, redis, RESERVA, INTERVALO_MIN, falha } from '../dados.js'

export default async function handler(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).end()
  try {
    const rotas = await rotasAtivas(await todosDisps())
    if (!rotas.length) return res.json({ checadas: [] })
    const c = await cota(true)
    // frações de checagem de uma hora pra outra se acumulam até virar uma checagem inteira
    let credito = Math.min(3, Number((await redis('GET', 'credito')) ?? 0) + ritmo(c, rotas).porHora)
    const prontas = rotas
      .filter(r => !r.ultima || Date.now() - new Date(r.ultima) >= INTERVALO_MIN - 10 * 60e3)
      .sort((a, b) => (a.ultima ?? '').localeCompare(b.ultima ?? ''))
    const checadas = []
    for (const r of prontas) {
      const gasto = r.volta ? 2 : 1
      if (credito < 1 || c.restantes - gasto < RESERVA) break
      await checarRota(r)
      credito -= 1; c.restantes -= gasto
      checadas.push(r.chave)
    }
    await redis('SET', 'credito', String(credito))
    res.json({ checadas, credito, restantes: c.restantes })
  } catch (err) { falha(res, err) }
}
