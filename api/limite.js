// O app é estático: pra mudar o limite, esta função grava o config.json direto no repositório.
// Precisa das variáveis GITHUB_TOKEN e APP_SENHA configuradas na Vercel.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { senha, precoMax } = req.body ?? {}
  if (!process.env.APP_SENHA || senha !== process.env.APP_SENHA) return res.status(401).json({ erro: 'Senha incorreta.' })
  const valor = Math.round(Number(precoMax))
  if (!(valor >= 100 && valor <= 50000)) return res.status(400).json({ erro: 'Use um valor entre R$ 100 e R$ 50.000.' })

  const url = `https://api.github.com/repos/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}/contents/config.json`
  const h = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }
  const atual = await fetch(url, { headers: h })
  if (!atual.ok) return res.status(502).json({ erro: `O GitHub não deixou ler o config.json (${atual.status}). Confira o GITHUB_TOKEN.` })
  const { content, sha } = await atual.json()
  const cfg = JSON.parse(Buffer.from(content, 'base64').toString())
  cfg.precoMax = valor
  const r = await fetch(url, { method: 'PUT', headers: h, body: JSON.stringify({
    message: `limite de R$ ${valor}`, sha, content: Buffer.from(JSON.stringify(cfg, null, 2) + '\n').toString('base64'),
  }) })
  if (!r.ok) return res.status(502).json({ erro: `O GitHub não deixou salvar (${r.status}). Confira o GITHUB_TOKEN.` })
  res.json({ precoMax: valor })
}
