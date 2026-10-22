const cheerio = require('cheerio');
const L = require('../../data/listino.json');
const BASE = 'https://www.ic8m.it';
const json = (c, b) => ({ statusCode: c, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
const NF = { error: 'codice non trovato' };

const UA = { 'user-agent': 'Mozilla/5.0 (preventivatore)' };
const VERSIONE = 4;
let TR = [];
const norm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function carica(url) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    TR.push(r.status + ' ' + url.replace(BASE, ''));
    return r.ok ? (await r.text()).split(/potrebbero piacerti/i)[0] : null; // esclude i prodotti suggeriti
  } catch (e) { TR.push('errore ' + e.message + ' ' + url.replace(BASE, '')); return null; }
}

// legge una scheda prodotto completa; restituisce null se la pagina e' un elenco (titolo = solo codice) o non e' una scheda
function leggi(raw, cand, debug) {
  const $ = cheerio.load(raw);
  const abs = (x) => new URL(x, BASE + '/').href;
  const imgs = $('img').map((_, e) => $(e).attr('src') || '').get().filter(Boolean).map(abs);
  const varianti = [...new Set(imgs.filter((x) => /\/icone\//.test(x)))];
  const principale = imgs.find((x) => /images2?\//.test(x)) || varianti[0];
  const h3 = $('h3').first();
  const nome = h3.text().trim();
  if (!h3.length || !principale || !nome || cand.some((t) => norm(t) === norm(nome))) {
    TR.push(`scartata: titolo "${nome}", ${varianti.length} varianti`);
    return null;
  }
  const box = h3.parent().clone();
  box.find('h1,h2,h3,h4,form,script,style,a').remove();
  const testo = box.text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  // le etichette (misure:, stampa:, ...) possono essere attaccate al testo: si divide sul nome dell'etichetta
  const parti = testo.split(/(?=(?:misure|stampa|imballo|materiale|peso|tag)\s*:)/i).map((x) => x.trim()).filter(Boolean);
  const spec = parti.filter((x) => /^(misure|stampa|imballo|materiale)\s*:/i.test(x));
  const desc = parti.filter((x) => !/^(misure|stampa|imballo|materiale|peso|tag)\s*:/i.test(x) && !/ritorna/i.test(x) && !/^\d+$/.test(x));
  if (debug) return { debug: true, nome, parti, html: $.html(h3.parent()).slice(0, 3000) };
  return { nome, descrizione: desc.join(' ').slice(0, 900), specifiche: spec, principale, varianti: varianti.slice(0, 12) };
}

async function scheda(cod, cand, debug) {
  const raw = await carica(`${BASE}/cat_ricerca.php?fam=tutto&sfam=tutto&cod=${encodeURIComponent(cod.toLowerCase())}&query=1&pag=1&ricerca=ricerca&cuchi=si`);
  if (!raw) return null;
  const p = leggi(raw, cand, debug);
  if (p) return p;
  // e' un elenco di risultati: segue il link della scheda completa (cat_ricerca-N-cod-ID.htm)
  const l = cheerio.load(raw);
  const hrefs = [...new Set(l('a').map((_, e) => l(e).attr('href') || '').get().filter((h) => /cat_ricerca-\d+-cod-/.test(h)))];
  const href = hrefs.find((h) => cand.some((t) => h.toUpperCase().includes(String(t).toUpperCase()))) || (hrefs.length === 1 ? hrefs[0] : null);
  if (!href) return null;
  const raw2 = await carica(new URL(href, BASE + '/').href);
  return raw2 ? leggi(raw2, cand, debug) : null;
}

// ultima risorsa: indirizzo diretto della scheda, provando le famiglie del catalogo (0-20) in parallelo
async function perId(id, cand, debug) {
  const fam = [1, 12, 14, 16, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 18, 19, 20, 0];
  const res = await Promise.all(fam.map(async (f) => {
    const raw = await carica(`${BASE}/cat_ricerca-${f}-cod-${encodeURIComponent(id)}.htm`);
    return raw ? leggi(raw, cand, debug) : null;
  }));
  return res.find(Boolean) || null;
}

exports.handler = async (ev) => {
  TR = [];
  const q = ev.queryStringParameters || {};
  const pw = ev.headers['x-pw'] || (q.debug ? q.pw : ''); // la password in URL vale solo in modalita' debug
  if (!process.env.APP_PASSWORD || pw !== process.env.APP_PASSWORD) return json(401, { error: 'password errata' });
  const typed = String(q.cod || '').trim().toUpperCase().replace(/\s+/g, '');
  const qty = parseInt(q.qty, 10);
  const key = L.items[typed] ? typed : L.alias[typed];
  const it = key && L.items[key];
  if (!it) return json(404, NF);
  if (!(qty > 0)) return json(400, { error: 'quantità non valida' });
  let page = null;
  const cand = [...new Set([typed, key, it.alt].filter(Boolean))];
  for (const c of cand) { page = await scheda(c, cand, q.debug); if (page) break; }
  if (!page && it.alt) page = await perId(it.alt, cand, q.debug);
  if (q.debug) return json(200, { versione: VERSIONE, candidati: cand, traccia: TR, pagina: page });
  if (!page) return json(404, NF);
  const tiers = Object.entries(it.t).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]);
  if (qty < tiers[0][0]) return json(422, { error: `quantità sotto il minimo (${tiers[0][0]} pezzi)` });
  const hit = tiers.filter((t) => t[0] <= qty).pop();
  return json(200, { ...page, cod: key, qty, scaglione: hit[0], prezzo: hit[1] });
};
