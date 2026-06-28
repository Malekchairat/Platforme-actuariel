const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8055";

export interface ProcessedCompany {
  id: string;
  filename: string;
  company: string;
}

export interface ClassificationResult {
  related: boolean;
  confidence: number;
  document_type: string;
  reason: string;
  method: string;
  keyword_score?: number;
}

export interface ImportResponse {
  success: boolean;
  status:
    | "processed"
    | "rejected"
    | "extraction_failed"
    | "quota_exceeded"
    | "gemini_error"
    | "error";
  message: string;
  classification?: ClassificationResult;
  output_file?: string;
  company_id?: string;
  data?: Record<string, unknown>;
}

function backendUnreachableMessage(): string {
  return (
    `Impossible de joindre le backend (${API_BASE}). ` +
    "Démarrez-le avec : python -m uvicorn backend.api.main:app --host 127.0.0.1 --port 8000"
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error(backendUnreachableMessage());
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchProcessedCompanies(): Promise<ProcessedCompany[]> {
  return request<ProcessedCompany[]>("/financial/processed");
}

export async function fetchProcessedData(companyId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/financial/processed/${companyId}`);
}

export async function importFinancialFile(file: File): Promise<ImportResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/financial/import`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error(backendUnreachableMessage());
  }

  let payload: ImportResponse;
  try {
    payload = (await response.json()) as ImportResponse;
  } catch {
    throw new Error(
      `Réponse invalide du serveur (${response.status}). ` +
        "Le backend a peut-être planté pendant l'extraction (quota Gemini ou timeout).",
    );
  }

  if (!response.ok && !payload.message) {
    throw new Error(`Import échoué (${response.status})`);
  }

  return payload;
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function getApiBaseUrl(): string {
  return API_BASE;
}
