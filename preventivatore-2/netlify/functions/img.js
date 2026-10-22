exports.handler = async (ev) => {
  if (!process.env.APP_PASSWORD || ev.headers['x-pw'] !== process.env.APP_PASSWORD) return { statusCode: 401, body: '' };
  let u; try { u = new URL((ev.queryStringParameters || {}).u || ''); } catch { return { statusCode: 400, body: '' }; }
  if (u.protocol !== 'https:' || u.hostname !== 'www.ic8m.it') return { statusCode: 400, body: '' };
  const r = await fetch(u.href);
  if (!r.ok) return { statusCode: 404, body: '' };
  return { statusCode: 200, isBase64Encoded: true, body: Buffer.from(await r.arrayBuffer()).toString('base64'),
    headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=86400' } };
};
