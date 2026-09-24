// Busca avulsa: ida e volta como dois trechos só de ida (2 buscas na SerpApi). Não mexe na rota acompanhada.
// Precisa da variável SERPAPI_KEY configurada na Vercel.
import { soIda } from '../serpapi.js'

const iata = /^[A-Z]{3}$/, data = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { origem, destino, ida, volta } = req.body ?? {}
  if (!iata.test(origem) || !iata.test(destino)) return res.status(400).json({ erro: 'Escolha a origem e o destino na lista de aeroportos.' })
  if (origem === destino) return res.status(400).json({ erro: 'A origem e o destino são o mesmo aeroporto.' })
  if (!data.test(ida) || !data.test(volta)) return res.status(400).json({ erro: 'Preencha as datas de ida e volta.' })
  if (volta < ida) return res.status(400).json({ erro: 'A volta precisa ser depois da ida.' })
  if (ida < new Date().toISOString().slice(0, 10)) return res.status(400).json({ erro: 'A data de ida já passou.' })

  try {
    const [i, v] = await Promise.all([soIda(origem, destino, ida, process.env.SERPAPI_KEY), soIda(destino, origem, volta, process.env.SERPAPI_KEY)])
    const corta = r => ({ ...r, voos: r.voos.slice(0, 8) })
    res.json({ ida: corta(i), volta: corta(v) })
  } catch (err) {
    res.status(502).json({ erro: 'A busca falhou: ' + err.message })
  }
}
