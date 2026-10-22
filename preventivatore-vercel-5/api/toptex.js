// Scheda prodotto TopTex: l'utente incolla il link della pagina; nome, descrizione, foto dei colori e prezzi si leggono da li'.
const VERSIONE = 'toptex-4';
const HOST = 'www.top-tex.it';

const dec = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&(amp|quot|apos|lt|gt|nbsp|euro);/g, (_, n) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', euro: '€' }[n]));
const txt = (h) => dec(String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function metas(html) {
  const m = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = {};
    tag.replace(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, k, v1, v2) => { a[k.toLowerCase()] = v1 !== undefined ? v1 : v2; return ''; });
    const k = a.property || a.name;
    if (k && a.content !== undefined) m[k.toLowerCase()] = dec(a.content);
  }
  return m;
}

// tabella "Prezzo consigliato di vendita": ogni cella con un prezzo diventa una scelta (es. "White", "Colori")
function prezzi(html) {
  const isP = (c) => /\d+(?:[.,]\d+)?\s*€/.test(c);
  for (const t of html.match(/<table\b[\s\S]*?<\/table>/gi) || []) {
    if (!t.includes('€') && !t.includes('&euro;')) continue;
    const righe = (t.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map((r) => (r.match(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi) || []).map(txt));
    const head = righe.find((r) => r.length && !r.some(isP)) || [];
    const opz = [];
    for (const r of righe.filter((x) => x.some(isP))) {
      const etichetta = isP(r[0]) ? '' : r[0];
      const celle = r.map((c, j) => [c, j]).filter(([c]) => isP(c));
      for (const [c, j] of celle) {
        const prezzo = parseFloat(c.match(/(\d+(?:[.,]\d+)?)\s*€/)[1].replace(',', '.'));
        const col = celle.length > 1 && head[j] ? head[j] : '';
        opz.push({ etichetta: [etichetta, col].filter(Boolean).join(' · ') || 'Prezzo consigliato', prezzo });
      }
    }
    if (opz.length) return opz;
  }
  return [];
}

// nomi dei colori: dall'alt dei campioncini colore; in mancanza, dal testo tra "Seleziona il colore" e "Taglie"
function nomiColori(html) {
  const out = [];
  const add = (n) => { n = dec(n).replace(/\s+/g, ' ').trim(); if (n && n.length < 40 && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n); };
  for (const t of html.match(/<img\b[^>]*>/gi) || []) if (/cdn\.toptex\.com\/stickers\//.test(t)) add((t.match(/\balt\s*=\s*"([^"]*)"/i) || [])[1]);
  if (out.length) return out;
  const i = html.search(/Seleziona il colore\s*:/i);
  if (i < 0) return out;
  const rest = html.slice(i).replace(/^[\s\S]*?Seleziona il colore\s*:/i, '');
  const j = rest.search(/Taglie\s*:/i);
  for (const piece of (j > 0 ? rest.slice(0, j) : rest.slice(0, 20000)).split(/<[^>]+>/)) add(piece);
  return out;
}

function leggi(html) {
  const m = metas(html);
  let cod = '', nome = '';
  for (const h of html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)) {
    const mm = txt(h[1]).match(/^([A-Za-z0-9._-]+)\s+-\s+(.+)$/);
    if (mm) { cod = mm[1].toUpperCase(); nome = mm[2]; break; }
  }
  if (!nome) {
    const t = (m['og:title'] || '').replace(/\s*-\s*TopTex.*$/i, '');
    const p = t.lastIndexOf(' - ');
    if (p > 0) { nome = t.slice(0, p); cod = t.slice(p + 3).trim().toUpperCase(); }
  }
  if (!nome) return null;

  const titolo = txt((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const marca = titolo.includes(' - ') ? titolo.split(' - ').pop().trim() : '';
  const peso = (txt(html).match(/(\d{2,4})\s*g\/m²/) || [])[1];
  const colori = nomiColori(html);

  // foto: le grandi (w=952) della galleria; quelle con la didascalia "Colore del prodotto" sono le foto dei colori
  const grandi = [];
  for (const x of html.matchAll(/https:\/\/cdn\.toptex\.com\/pictures\/[^"'\s<>)\\]+/g)) {
    const base = x[0].split('?')[0];
    if (/[?&]w=952\b/.test(x[0]) && !grandi.some((g) => g.base === base)) grandi.push({ base, i: x.index });
  }
  if (!grandi.length) {
    for (const x of html.matchAll(/https:\/\/cdn\.toptex\.com\/pictures\/[^"'\s<>)\\]+/g)) {
      const base = x[0].split('?')[0];
      if (!grandi.some((g) => g.base === base)) grandi.push({ base, i: x.index });
    }
  }
  grandi.forEach((g, k) => { g.colore = /Colore del prodotto/i.test(txt(html.slice(g.i, grandi[k + 1] ? grandi[k + 1].i : g.i + 1500))); });
  const colorate = grandi.filter((g) => g.colore);
  const scelte = colorate.length ? colorate : grandi;
  if (!scelte.length) return null;

  const ds = [(m.description || '').replace(/\s*Distribuito da TopTex\.?\s*$/i, '').trim(),
    (m['og:description'] || '').replace(new RegExp('^' + nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,?\\s*', 'i'), '').trim()].filter(Boolean);
  return {
    nome, cod, descrizione: [...new Set(ds)].join(' ').slice(0, 900),
    specifiche: [marca && 'Marca: ' + marca, peso && 'Grammatura: ' + peso + ' g/m²'].filter(Boolean),
    principale: scelte[0].base + '?w=660', varianti: [], colori, opzioni: prezzi(html),
  };
}

const norm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

module.exports = async (req, res) => {
  const q = req.query || {};
  const pw = req.headers['x-pw'] || (q.debug ? q.pw : '');
  if (!process.env.APP_PASSWORD || pw !== process.env.APP_PASSWORD) return res.status(401).json({ error: 'password errata' });
  const cod = String(q.cod || '').trim().toUpperCase().replace(/\s+/g, '');
  let u;
  try {
    if (q.url) u = new URL(String(q.url).trim()); // link della scheda incollato dall'utente
    else if (/^[A-Z0-9._-]{2,30}$/.test(cod)) u = new URL(`https://${HOST}/catalog/product/view/sku/${encodeURIComponent(cod)}/`); // ricerca per codice
    else return res.status(404).json({ error: 'codice non trovato' });
  } catch { return res.status(400).json({ error: 'link non valido' }); }
  if (u.protocol !== 'https:' || u.hostname !== HOST) return res.status(400).json({ error: 'il link deve essere di www.top-tex.it' });
  const qty = parseInt(q.qty, 10) > 0 ? parseInt(q.qty, 10) : 1; // il prezzo TopTex non dipende dalla quantita'
  let html, finale = u.href;
  try {
    const r = await fetch(u.href, { headers: { 'user-agent': 'Mozilla/5.0 (preventivatore)', 'accept-language': 'it-IT,it;q=0.9' }, signal: AbortSignal.timeout(8000) });
    finale = r.url || u.href;
    if (!r.ok) return res.status(404).json(q.debug ? { error: 'codice non trovato', stato: r.status, finale } : { error: 'codice non trovato' });
    html = await r.text();
  } catch { return res.status(502).json({ error: 'sito TopTex non raggiungibile' }); }
  const p = leggi(html);
  if (q.debug) return res.status(200).json({ versione: VERSIONE, richiesto: u.href, finale, lunghezza: html.length, pagina: p });
  if (!p || (cod && !q.url && norm(p.cod) !== norm(cod))) return res.status(404).json({ error: 'codice non trovato' });
  if (!p.opzioni.length) return res.status(404).json({ error: 'prezzo non trovato sulla pagina' });
  return res.status(200).json({ ...p, qty, prezzo: p.opzioni[0].prezzo, etichetta: p.opzioni[0].etichetta, origine: 'toptex' });
};
module.exports.leggi = leggi;
