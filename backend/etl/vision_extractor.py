import json
import re
import fitz  # PyMuPDF
from PIL import Image
import io
from typing import Any

from .gemini_service import get_client
from .config import GEMINI_MODEL

def clean_number(val: Any) -> float | None:
    """Nettoyage brutal et infaillible pour les nombres comptables."""
    if val is None:
        return None
        
    text = str(val).strip()
    if not text or text.lower() == "null" or text == "-":
        return None
        
    # 1. Détection du signe négatif
    is_negative = False
    if '(' in text and ')' in text:
        is_negative = True
    elif any(minus in text for minus in ['-', '–', '—', '−']):
        is_negative = True
        
    # 2. Remplacement de la virgule par un point
    text = text.replace(',', '.')
    
    # 3. Extraction pure des chiffres et du point
    cleaned = re.sub(r'[^\d.]', '', text)
    
    if cleaned.count('.') > 1:
        parts = cleaned.split('.')
        cleaned = parts[0] + '.' + ''.join(parts[1:])
        
    if not cleaned or cleaned == '.':
        return None
        
    try:
        num = float(cleaned)
        return -num if is_negative else num
    except ValueError:
        return None


def extract_portfolio_with_vision(pdf_path: str, page_number: int) -> dict[str, Any]:
    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(page_number - 1)
        pix = page.get_pixmap(dpi=200)
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))

        client = get_client()

        # LE PROMPT EST MAINTENANT BLINDÉ AVEC UN DICTIONNAIRE DE SYNONYMES
        prompt = """
        Tu es un actuaire auditeur. Voici l'image du tableau 'Résultat technique par catégorie'.
        Extrais les valeurs EXACTES de l'année en cours (Exercice N) pour CHAQUE colonne individuellement.
        
        RÈGLE ABSOLUE : NE FAIS AUCUN CALCUL MATHEMATHIQUE. Ne somme aucune colonne. Contente-toi de lire la cellule.
        - "charges_sinistres" = Ligne "Charges de prestation", "Prestations payées", ou "Charges de sinistres".
        - "primes_acquises" = Ligne "Primes acquises", "Primes", ou "Primes émises".
        - "resultat_technique" = Ligne "Résultat technique", "Solde", ou "Marge technique".
        - Remplace les cellules vides par null. 
        
        MAPPING STRICT DES COLONNES (TRÈS IMPORTANT) :
        - 'automobile' : Cherche la colonne "Auto" ou "Automobile".
        - 'sante' : Cherche la colonne "Maladie", "Santé", ou "Groupe".
        - 'ard' : Cherche la colonne "ARD", "Risques divers", ou "RC".
        - 'incendie' : Cherche la colonne "Incendie".
        - 'transport' : Cherche la colonne "Transport".
        - 'engineering' : Cherche la colonne "Engineering", "Risques Techniques", "Risques Spéciaux" ou "Risq. Spx".
        
        Renvoie UNIQUEMENT ce JSON exact :
        {
            "automobile": { "primes_acquises": {"val_n": null}, "charges_sinistres": {"val_n": null}, "resultat_technique": {"val_n": null} },
            "sante": { "primes_acquises": {"val_n": null}, "charges_sinistres": {"val_n": null}, "resultat_technique": {"val_n": null} },
            "incendie": { "primes_acquises": {"val_n": null}, "charges_sinistres": {"val_n": null}, "resultat_technique": {"val_n": null} },
            "transport": { "primes_acquises": {"val_n": null}, "charges_sinistres": {"val_n": null}, "resultat_technique": {"val_n": null} },
            "ard": { "primes_acquises": {"val_n": null}, "charges_sinistres": {"val_n": null}, "resultat_technique": {"val_n": null} },
            "engineering": { "primes_acquises": {"val_n": null}, "charges_sinistres": {"val_n": null}, "resultat_technique": {"val_n": null} }
        }
        """

        model_name = GEMINI_MODEL if "flash" in GEMINI_MODEL.lower() or "pro" in GEMINI_MODEL.lower() else "gemini-2.5-flash"
        response = client.models.generate_content(model=model_name, contents=[img, prompt])
        
        text = response.text or ""
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {}
            
        raw_data = json.loads(match.group(0))
        
        # Application du nettoyage aux branches directes (On ajoute Incendie et Transport)
        for branch in ["automobile", "sante", "incendie", "transport"]:
            if branch in raw_data:
                for metric in ["primes_acquises", "charges_sinistres", "resultat_technique"]:
                    raw_val = raw_data[branch].get(metric, {}).get("val_n")
                    raw_data[branch].setdefault(metric, {})["val_n"] = clean_number(raw_val)
                    
        final_data = {
            "automobile": raw_data.get("automobile", {}),
            "sante": raw_data.get("sante", {}),
            "incendie": raw_data.get("incendie", {}),
            "transport": raw_data.get("transport", {}),
            "risques_divers": {  # Ceci représente maintenant "Autres Risques Divers (Le reste)"
                "primes_acquises": {"val_n": None},
                "charges_sinistres": {"val_n": None},
                "resultat_technique": {"val_n": None}
            }
        }

        # Agrégation Python pour les "Autres Risques Divers" uniquement
        rd_sub_branches = ["ard", "engineering"]
        for metric in ["primes_acquises", "charges_sinistres", "resultat_technique"]:
            total = 0.0
            has_value = False
            for sub in rd_sub_branches:
                raw_val = raw_data.get(sub, {}).get(metric, {}).get("val_n")
                num_val = clean_number(raw_val)
                
                if num_val is not None:
                    total += num_val
                    has_value = True
                    
            if has_value:
                final_data["risques_divers"][metric]["val_n"] = round(total, 3)

        return final_data

    except Exception as e:
        print(f"⚠️ Erreur Vision : {e}")
        return {}