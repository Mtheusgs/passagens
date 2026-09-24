// Dispara o workflow "check" na hora, o mesmo que roda a cada 8 horas.
// O GITHUB_TOKEN precisa da permissão Actions: Read and write.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const base = `https://api.github.com/repos/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}/actions/workflows/check.yml`
  const h = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }

  // segura toque duplo enquanto a busca anterior ainda roda (cada uma gasta 1 da cota da SerpApi)
  const ult = await fetch(`${base}/runs?per_page=1`, { headers: h })
  if (!ult.ok) return res.status(502).json({ erro: `O GitHub não deixou ver as buscas (${ult.status}). Confira o GITHUB_TOKEN.` })
  const run = (await ult.json()).workflow_runs?.[0]
  const espera = run ? 2 * 60e3 - (Date.now() - new Date(run.created_at)) : 0
  if (espera > 0) return res.status(429).json({ erro: `Teve uma busca agora há pouco. Tente de novo em ${Math.ceil(espera / 60e3)} min.` })

  const r = await fetch(`${base}/dispatches`, { method: 'POST', headers: h, body: JSON.stringify({ ref: 'main' }) })
  if (!r.ok) return res.status(502).json({ erro: `O GitHub não deixou iniciar a busca (${r.status}). Confira o GITHUB_TOKEN.` })
  res.json({ ok: true })
}
