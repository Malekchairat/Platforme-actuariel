import re
from datetime import date, datetime
from typing import Any


def normalize_societe(value: str | None) -> str:
	if not value:
		return "INCONNU"
	return re.sub(r"\s+", " ", value.strip().upper())


def parse_document_date(value: str | None) -> date | None:
	if not value:
		return None

	raw = value.strip().replace("_", "-")
	if not raw:
		return None

	for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
		try:
			return datetime.strptime(raw, fmt).date()
		except ValueError:
			pass

	if re.fullmatch(r"\d{4}", raw):
		return date(int(raw), 12, 31)

	return None


def to_float(value: Any) -> float | None:
	if value is None:
		return None

	if isinstance(value, (int, float)):
		return float(value)

	text = str(value).strip()
	if not text:
		return None

	text = text.replace("%", "")
	text = re.sub(r"\s+", "", text).replace(",", ".")

	try:
		return float(text)
	except ValueError:
		return None
