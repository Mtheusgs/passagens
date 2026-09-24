// Busca só de ida no Google Flights (via SerpApi). Voos simplificados, do mais barato pro mais caro.
export async function soIda(de, para, data, chave) {
  const q = new URLSearchParams({ engine: 'google_flights', departure_id: de, arrival_id: para, outbound_date: data,
    type: '2', currency: 'BRL', hl: 'pt', gl: 'br', api_key: chave })
  const d = await (await fetch('https://serpapi.com/search.json?' + q)).json()
  if (d.error && !/returned any results|no results/i.test(d.error)) throw new Error(d.error)
  const voos = [...(d.best_flights ?? []), ...(d.other_flights ?? [])].filter(v => v.price)
    .sort((a, b) => a.price - b.price)
    .map(v => ({
      preco: v.price,
      cia: [...new Set(v.flights.map(f => f.airline))].join(' + '),
      saida: v.flights[0].departure_airport.time,
      chegada: v.flights.at(-1).arrival_airport.time,
      duracao: v.total_duration,
      escalas: (v.layovers ?? []).map(l => l.id),
    }))
  return { voos, url: d.search_metadata?.google_flights_url, nivel: d.price_insights?.price_level, faixa: d.price_insights?.typical_price_range }
}
