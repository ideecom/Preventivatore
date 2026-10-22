module.exports = async (req, res) => {
  const q = req.query || {};
  if (!process.env.APP_PASSWORD || req.headers['x-pw'] !== process.env.APP_PASSWORD) return res.status(401).end();
  let u; try { u = new URL(String(q.u || '')); } catch { return res.status(400).end(); }
  if (u.protocol !== 'https:' || !['www.ic8m.it', 'cdn.toptex.com'].includes(u.hostname)) return res.status(400).end();
  const r = await fetch(u.href);
  if (!r.ok) return res.status(404).end();
  res.setHeader('content-type', r.headers.get('content-type') || 'image/jpeg');
  res.setHeader('cache-control', 'private, max-age=86400');
  return res.status(200).send(Buffer.from(await r.arrayBuffer()));
};
