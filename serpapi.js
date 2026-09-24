// Busca só de ida no Google Flights (via SerpApi). Voos simplificados, do mais barato pro mais caro.
export async function soIda(de, para, data, chave) {
  // deep_search: sem ele a SerpApi devolve preços de cache, às vezes bem abaixo do que o Google Flights mostra de verdade
  const q = new URLSearchParams({ engine: 'google_flights', departure_id: de, arrival_id: para, outbound_date: data,
    type: '2', currency: 'BRL', hl: 'pt', gl: 'br', deep_search: 'true', api_key: chave })
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

// Quantas buscas restam na conta e quando a cota renova. Essa consulta não gasta busca.
export async function cota(chave) {
  const d = await (await fetch('https://serpapi.com/account.json?api_key=' + chave)).json()
  if (d.error) throw new Error(d.error)
  return { restantes: d.total_searches_left ?? d.plan_searches_left ?? 0, renova: d.plan_renewal_date }
}
