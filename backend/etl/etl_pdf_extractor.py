"""
ETL PDF → CSV/JSON pour le Copilot Actuariel BH
Extrait : tableaux financiers, indicateurs clés, provisions techniques
Usage   : python etl_pdf_extractor.py
"""

import os, re, json
from pathlib import Path
from datetime import datetime

import pdfplumber
import pandas as pd

# ── Chemins (à adapter si besoin) ─────────────────────────────────────────────
BASE = Path(__file__).parent.parent.parent  # remonte à la racine du projet
RAW  = BASE / "data" / "raw"
OUT  = BASE / "data" / "extracted"
OUT_TABLES = OUT / "tables"
OUT_TEXT   = OUT / "text"
for p in [OUT_TABLES, OUT_TEXT]: p.mkdir(parents=True, exist_ok=True)

# ── Sociétés connues (pour nommer les fichiers de sortie) ─────────────────────
SOCIETES = [
    "STAR","MAGHREBIA","MAGHREBIA_VIE","BIAT","BNA",
    "ASTREE","AMANA","ATTIJARI","CARTE","CARTE_VIE",
    "COMAR","HAYETT","GAT","GAT_VIE","ZITOUNA","TAKAFULIA"
]

# ── Indicateurs à chercher dans le texte (regex) ──────────────────────────────
PATTERNS = {
    "primes_emises":          r"[Pp]rimes?\s+[ée]mis(?:es?)[\s:]+([0-9\s\.,]+)",
    "charge_sinistres":       r"[Cc]harge[s]?\s+(?:des\s+)?sinistres?[\s:]+([0-9\s\.,]+)",
    "provisions_techniques":  r"[Pp]rovisions?\s+[Tt]echniques?[\s:]+([0-9\s\.,]+)",
    "resultat_net":           r"[Rr][ée]sultat\s+[Nn]et[\s:]+([0-9\s\.,]+)",
    "total_bilan":            r"[Tt]otal\s+[Bb]ilan[\s:]+([0-9\s\.,]+)",
    "fonds_propres":          r"[Ff]onds\s+[Pp]ropres?[\s:]+([0-9\s\.,]+)",
    "ratio_sp":               r"[Rr]atio\s+S/P[\s:]+([0-9\s\.,]+\s*%?)",
}

def clean_number(s: str) -> float | None:
    """Nettoie une chaîne numérique extraite : '1 234 567,89' → 1234567.89"""
    s = re.sub(r"\s+", "", s).replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

def detect_societe(pdf_path: Path) -> str:
    name = pdf_path.stem.upper()
    for s in SOCIETES:
        if s.replace("_", " ") in name or s in name:
            return s
    return pdf_path.stem

def detect_date(pdf_path: Path) -> str:
    m = re.search(r"(\d{2}[-_]\d{2}[-_]\d{4}|\d{4})", pdf_path.stem)
    return m.group(0) if m else "INCONNU"

def make_unique_headers(headers: list) -> list:
    """Rend les noms de colonnes uniques en suffixant les doublons."""
    seen = {}
    unique = []
    for h in headers:
        h = str(h).strip() if h else "col"
        if not h:
            h = "col"
        count = seen.get(h, 0) + 1
        seen[h] = count
        unique.append(f"{h}_{count}" if count > 1 else h)
    return unique

def extract_tables(pdf_path: Path, societe: str) -> list[pd.DataFrame]:
    """Extrait tous les tableaux d'un PDF avec pdfplumber."""
    all_dfs = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for j, table in enumerate(tables):
                if not table or len(table) < 2:
                    continue
                try:
                    headers = make_unique_headers(table[0])
                    df = pd.DataFrame(table[1:], columns=headers)
                    df.insert(0, "societe", societe)
                    df.insert(1, "page", i + 1)
                    df.insert(2, "table_num", j + 1)
                    all_dfs.append(df)
                except Exception:
                    pass
    return all_dfs

def extract_kpis(pdf_path: Path, societe: str, date_doc: str) -> dict:
    """Extrait les KPIs clés par regex sur le texte brut."""
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                full_text += t + "\n"

    kpis = {"societe": societe, "date_document": date_doc, "source_fichier": pdf_path.name}
    for key, pattern in PATTERNS.items():
        match = re.search(pattern, full_text)
        if match:
            kpis[key] = clean_number(match.group(1))
        else:
            kpis[key] = None
    return kpis

def extract_full_text(pdf_path: Path) -> str:
    """Texte brut complet — utilisé pour le RAG (FAISS + embeddings)."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    return text

def process_pdf(pdf_path: Path):
    societe   = detect_societe(pdf_path)
    date_doc  = detect_date(pdf_path)
    print(f"  → {societe} ({date_doc})")

    # 1. Tableaux → CSV
    dfs = extract_tables(pdf_path, societe)
    if dfs:
        combined = pd.concat(dfs, ignore_index=True)
        out_csv = OUT_TABLES / f"{societe}_{date_doc}_tables.csv"
        combined.to_csv(out_csv, index=False, encoding="utf-8-sig")
        print(f"     Tables : {len(dfs)} tableau(x) → {out_csv.name}")

    # 2. KPIs → JSON
    kpis = extract_kpis(pdf_path, societe, date_doc)
    out_kpi = OUT_TABLES / f"{societe}_{date_doc}_kpis.json"
    with open(out_kpi, "w", encoding="utf-8") as f:
        json.dump(kpis, f, ensure_ascii=False, indent=2)
    print(f"     KPIs   : {sum(1 for v in kpis.values() if v is not None) - 3} indicateurs trouvés")

    # 3. Texte brut → TXT (pour RAG)
    text = extract_full_text(pdf_path)
    out_txt = OUT_TEXT / f"{societe}_{date_doc}.txt"
    out_txt.write_text(text, encoding="utf-8")
    print(f"     Texte  : {len(text):,} caractères → {out_txt.name}")

def run_all():
    # Fix 1 : exclure le dossier extracted + éviter les doublons avec un set
    pdf_files = list({
        p for p in list(RAW.rglob("*.pdf")) + list(RAW.rglob("*.PDF"))
        if "extracted" not in p.parts
    })

    if not pdf_files:
        print("⚠️  Aucun PDF trouvé dans data/raw/")
        print("   Placez vos PDFs dans les sous-dossiers :")
        print("   data/raw/etats_financiers/")
        print("   data/raw/rapports_activites/")
        print("   data/raw/indicateurs/")
        return

    print(f"\n📄 {len(pdf_files)} PDF(s) trouvé(s) — extraction en cours...\n")
    all_kpis = []

    for pdf_path in sorted(pdf_files):
        try:
            process_pdf(pdf_path)
            kpis = extract_kpis(pdf_path, detect_societe(pdf_path), detect_date(pdf_path))
            all_kpis.append(kpis)
        except Exception as e:
            print(f"  ❌ Erreur sur {pdf_path.name} : {e}")

    # KPIs consolidés toutes sociétés
    if all_kpis:
        df_kpis = pd.DataFrame(all_kpis)
        out = OUT_TABLES / "ALL_SOCIETES_kpis.csv"
        df_kpis.to_csv(out, index=False, encoding="utf-8-sig")
        print(f"\n✅ Récap consolidé → {out}")

    print(f"\n🎉 Extraction terminée — {datetime.now().strftime('%H:%M:%S')}")

if __name__ == "__main__":
    run_all()