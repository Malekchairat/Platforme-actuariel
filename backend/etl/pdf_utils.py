from __future__ import annotations

import json
from pathlib import Path

import pdfplumber

from .config import FINANCIAL_KEYWORDS


def extract_text_from_pdf(pdf_path: str | Path) -> list[dict[str, str | int]]:
    pages: list[dict[str, str | int]] = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            # 1. Extraction classique par défaut (Sécurité maximale pour ne pas casser l'existant)
            base_text = page.extract_text()
            
            if not base_text:
                continue

            final_text = base_text
            text_lower = base_text.lower()
            
            # 2. DÉTECTION CIBLÉE : Est-ce la fameuse page du portefeuille / Annexe 13 ou 15 ?
            is_portfolio_page = any(kw in text_lower for kw in [
                "annexe 13", "annexe n° 13", "annexe n°13",
                "annexe 15", "annexe n° 15", "annexe n°15",
                "résultat technique par catégorie",
                "compte technique par branche",
                "ventilation par branche"
            ])

            if is_portfolio_page:
                # 3. EXTRACTION CHIRURGICALE : On active le moteur de tableaux de pdfplumber
                # "vertical_strategy": "text" force pdfplumber à créer des colonnes 
                # en se basant sur l'alignement vertical des mots (parfait pour les tableaux sans bordures)
                table_settings = {
                    "vertical_strategy": "text", 
                    "horizontal_strategy": "text"
                }
                tables = page.extract_tables(table_settings)
                
                if tables:
                    table_str = "\n\n--- DÉBUT DE LA RECONSTRUCTION GÉOMÉTRIQUE DU TABLEAU (PORTFEUILLE) ---\n"
                    for table in tables:
                        for row in table:
                            # Nettoyage de chaque cellule et assemblage avec des " | "
                            # On remplace les vides par "VIDE" ou tiret pour aider le LLM à garder l'alignement
                            clean_row = [str(cell).replace('\n', ' ').strip() if cell else "-" for cell in row]
                            table_str += " | ".join(clean_row) + "\n"
                    table_str += "--- FIN DE LA RECONSTRUCTION DU TABLEAU ---\n\n"
                    
                    # On ajoute ce tableau propre à la fin du texte brut de la page
                    final_text = base_text + table_str
                else:
                    # Plan B de secours : Si la stratégie tableau échoue, on tente le layout spatial
                    # qui préserve physiquement les espaces entre les colonnes
                    try:
                        layout_text = page.extract_text(layout=True)
                        if layout_text:
                            final_text = layout_text
                    except Exception:
                        pass # Si version pdfplumber trop ancienne, on garde le base_text

            pages.append({"page_number": i + 1, "text": final_text})

    return pages


def extract_text_from_txt(txt_path: str | Path) -> list[dict[str, str | int]]:
    text = Path(txt_path).read_text(encoding="utf-8", errors="ignore")
    return [{"page_number": 1, "text": text}] if text.strip() else []


def extract_text_from_json(json_path: str | Path) -> list[dict[str, str | int]]:
    payload = json.loads(Path(json_path).read_text(encoding="utf-8"))
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    return [{"page_number": 1, "text": text}]


def extract_document_pages(file_path: str | Path) -> list[dict[str, str | int]]:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return extract_text_from_pdf(path)
    if suffix == ".txt":
        return extract_text_from_txt(path)
    if suffix == ".json":
        return extract_text_from_json(path)

    raise ValueError(f"Unsupported file type: {suffix}")


def filter_relevant_pages(pages: list[dict[str, str | int]]) -> list[dict[str, str | int]]:
    selected: list[dict[str, str | int]] = []

    for page in pages:
        text_lower = str(page["text"]).lower()
        if any(keyword in text_lower for keyword in FINANCIAL_KEYWORDS):
            selected.append(page)

    return selected or pages[: min(3, len(pages))]


def build_chunks(
    pages: list[dict[str, str | int]],
    max_chars: int = 28000,
    max_chunks: int = 2,
) -> list[str]:
    chunks: list[str] = []
    current_chunk = ""

    for page in pages:
        page_text = f"\n\n===== PAGE {page['page_number']} =====\n\n{page['text']}"
        if len(current_chunk) + len(page_text) > max_chars:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = page_text
        else:
            current_chunk += page_text

    if current_chunk:
        chunks.append(current_chunk)

    if len(chunks) > max_chunks:
        merged: list[str] = []
        group_size = (len(chunks) + max_chunks - 1) // max_chunks
        for i in range(0, len(chunks), group_size):
            merged.append("\n".join(chunks[i : i + group_size]))
        chunks = merged[:max_chunks]

    return chunks


def build_document_sample(pages: list[dict[str, str | int]], max_chars: int = 8000) -> str:
    parts: list[str] = []
    total = 0

    for page in pages:
        snippet = f"\n\n===== PAGE {page['page_number']} =====\n\n{page['text']}"
        if total + len(snippet) > max_chars:
            remaining = max_chars - total
            if remaining > 500:
                parts.append(snippet[:remaining])
            break
        parts.append(snippet)
        total += len(snippet)

    return "".join(parts)