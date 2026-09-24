// Busca avulsa de ida e volta no Google Flights (via SerpApi). Não mexe na rota acompanhada.
// Precisa da variável SERPAPI_KEY configurada na Vercel.
const iata = /^[A-Z]{3}$/, data = /^\d{4}-\d{2}-\d{2}$/

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { origem, destino, ida, volta } = req.body ?? {}
  if (!iata.test(origem) || !iata.test(destino)) return res.status(400).json({ erro: 'Escolha a origem e o destino na lista de aeroportos.' })
  if (origem === destino) return res.status(400).json({ erro: 'A origem e o destino são o mesmo aeroporto.' })
  if (!data.test(ida) || !data.test(volta)) return res.status(400).json({ erro: 'Preencha as datas de ida e volta.' })
  if (volta < ida) return res.status(400).json({ erro: 'A volta precisa ser depois da ida.' })
  if (ida < new Date().toISOString().slice(0, 10)) return res.status(400).json({ erro: 'A data de ida já passou.' })

  const q = new URLSearchParams({ engine: 'google_flights', departure_id: origem, arrival_id: destino, outbound_date: ida,
    return_date: volta, type: '1', currency: 'BRL', hl: 'pt', gl: 'br', api_key: process.env.SERPAPI_KEY })
  const d = await (await fetch('https://serpapi.com/search.json?' + q)).json()
  if (d.error && !/no results/i.test(d.error)) return res.status(502).json({ erro: 'A busca falhou: ' + d.error })

  const voos = [...(d.best_flights ?? []), ...(d.other_flights ?? [])].filter(v => v.price)
    .sort((a, b) => a.price - b.price).slice(0, 10)
    .map(v => ({
      preco: v.price,
      cia: [...new Set(v.flights.map(f => f.airline))].join(' + '),
      saida: v.flights[0].departure_airport.time,
      chegada: v.flights.at(-1).arrival_airport.time,
      duracao: v.total_duration,
      escalas: (v.layovers ?? []).map(l => l.id),
    }))
  const pi = d.price_insights
  res.json({
    voos,
    url: d.search_metadata?.google_flights_url,
    nivel: pi?.price_level, // "low" | "typical" | "high"
    faixa: pi?.typical_price_range,
  })
}
