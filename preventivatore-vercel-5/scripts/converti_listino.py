"""Converte il listino Excel in data/listino.json.
Uso: python scripts/converti_listino.py LISTINO_GENERALE.xlsx   (accetta anche .xls, serve xlrd)
Rilancialo ogni volta che aggiorni il listino, poi ripubblica su Netlify."""
import sys, json, pandas as pd
FOGLI = ["HIDEAS","HIIDEAS SELECTIONS","CALENDARI","AGENDE","PENNE","SILICON","SIPEC","STRICKER","MIDOCEAN","MYDAY","VARI"]
def num(v):
    try: f = float(v)
    except (TypeError, ValueError): return None
    return None if f != f else f
src = sys.argv[1]; items = {}; alias = {}; dup = 0
for nome in FOGLI:
    df = pd.read_excel(src, sheet_name=nome, header=None)
    h = next((i for i in range(min(15, len(df))) if any(str(c).strip().upper() == "CODICE" for c in df.iloc[i])), None)
    if h is None: print("saltato", nome); continue
    hr = list(df.iloc[h]); cc = next(i for i, c in enumerate(hr) if str(c).strip().upper() == "CODICE")
    dc = next((i for i, c in enumerate(hr) if str(c).strip().upper() in ("DESCRIZIONE", "ARTICOLO")), cc + 1)
    qcols = {i: int(num(c)) for i, c in enumerate(hr) if num(c) and i > cc}
    ac = next((i for i in range(dc + 1, min(qcols) if qcols else 0) if pd.isna(hr[i])), None)
    sup = next((i for i, c in enumerate(hr) if i > cc and i not in qcols and str(c).strip().upper().startswith("STAMPA")), None)
    for r in range(h + 1, len(df)):
        row = df.iloc[r]; code = row[cc]
        if pd.isna(code) or not str(code).strip(): continue
        code = str(code).strip().upper().replace(" ", "")
        tiers = {str(q): round(p, 4) for i, q in qcols.items() if (p := num(row[i])) and p > 0}
        if not tiers: continue
        if code in items: dup += 1; continue
        alt = row[ac] if ac is not None else None
        alt = None if alt is None or pd.isna(alt) or alt in (0, "") else str(alt).replace(".0", "").strip().upper()
        items[code] = {"d": str(row[dc]).strip().replace("\n", " "), "f": nome, "alt": alt, "t": tiers,
                       "s": (round(num(row[sup]), 4) if sup is not None and num(row[sup]) else None)}
        if alt: alias.setdefault(alt, code)
json.dump({"items": items, "alias": alias}, open("data/listino.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(items), "articoli,", len(alias), "alias,", dup, "duplicati ignorati")
