import {
  checkApiHealth,
  fetchProcessedCompanies,
  fetchProcessedData,
} from "./api-client";
import {
  buildBranchComparison,
  buildFinancialStructure,
  buildPortfolios,
  buildSinistresTimeSeries,
  extractKPIs,
  flattenFinancialData,
} from "./financial-transformers";
import type {
  AnalysisResponse,
  ComparisonPoint,
  FinancialData,
  KPI,
  Portfolio,
  StructureSlice,
  TableRow,
  TimeSeriesPoint,
} from "./types";

interface CompanyRecord {
  id: string;
  data: FinancialData;
}

const ANALYSIS_RESPONSES: Record<string, AnalysisResponse> = {
  rentabilite: {
    answer:
      "Les portefeuilles les moins rentables sont Transport (non-vie) et Multirisques (non-vie). Le segment Épargne (vie) affiche la meilleure rentabilité relative.",
    sql: `SELECT portfolio_name, branch, resultat / NULLIF(primes, 0) AS ratio_technique FROM portfolios ORDER BY ratio_technique ASC LIMIT 5;`,
    explanation:
      "Analyse basée sur le ratio résultat technique / primes émises par segment.",
  },
  sinistres: {
    answer:
      "Les sinistres ont augmenté, principalement portés par la branche non-vie. Les branches Automobile et Transport concentrent la hausse.",
    sql: `SELECT branch, SUM(charges_sinistres) AS total_sinistres FROM financial_statements GROUP BY branch;`,
    explanation:
      "Décomposition volume/coût sur les branches automobile et transport.",
  },
  default: {
    answer:
      "D'après les données importées, consultez le dashboard pour les indicateurs agrégés (primes, sinistres, fonds propres).",
    sql: `SELECT company, primes_emises, resultat_technique, fonds_propres, total_bilan FROM financial_summary;`,
    explanation: "Réponse générée à partir des données JSON disponibles.",
  },
};

let cachedRecords: CompanyRecord[] | null = null;
let apiAvailable: boolean | null = null;

async function isApiAvailable(): Promise<boolean> {
  if (apiAvailable !== null) return apiAvailable;
  apiAvailable = await checkApiHealth();
  return apiAvailable;
}

async function loadRecordsFromApi(): Promise<CompanyRecord[]> {
  const list = await fetchProcessedCompanies();
  return Promise.all(
    list.map(async (item) => ({
      id: item.id,
      data: (await fetchProcessedData(item.id)) as unknown as FinancialData,
    })),
  );
}

async function getAllRecords(): Promise<CompanyRecord[]> {
  if (cachedRecords) return cachedRecords;

  if (await isApiAvailable()) {
    const fromApi = await loadRecordsFromApi();
    if (fromApi.length > 0) {
      cachedRecords = fromApi;
      return fromApi;
    }
  }

  // No static fallback by default anymore. Return empty array if backend has no data.
  return [];
}

export function clearDataCache() {
  cachedRecords = null;
  apiAvailable = null;
}

function findRecord(records: CompanyRecord[], companyId?: string): CompanyRecord | null {
  if (records.length === 0) return null;
  if (!companyId) return records[0];

  const normalized = companyId.toLowerCase();
  const match = records.find(
    (record) =>
      record.id.toLowerCase() === normalized ||
      record.data.company.toLowerCase().includes(normalized) ||
      normalized.includes(record.id.toLowerCase()),
  );

  return match ?? records[0];
}

export async function getFinancialData(companyId?: string): Promise<FinancialData> {
  await delay(50);
  const records = await getAllRecords();
  const record = findRecord(records, companyId);
  
  if (!record) {
    throw new Error("Aucune donnée financière disponible. Veuillez importer un document d'abord.");
  }
  return record.data;
}

export async function getCompanies(): Promise<{ id: string; name: string }[]> {
  const records = await getAllRecords();
  return records.map((record) => ({
    id: record.id,
    name: record.data.company,
  }));
}

export async function getKPIs(companyId?: string): Promise<KPI[]> {
  const data = await getFinancialData(companyId);
  return extractKPIs(data);
}

export async function getSinistresEvolution(companyId?: string): Promise<TimeSeriesPoint[]> {
  const data = await getFinancialData(companyId);
  return buildSinistresTimeSeries(data);
}

export async function getBranchComparison(companyId?: string): Promise<ComparisonPoint[]> {
  const data = await getFinancialData(companyId);
  return buildBranchComparison(data);
}

export async function getFinancialStructure(companyId?: string): Promise<StructureSlice[]> {
  const data = await getFinancialData(companyId);
  return buildFinancialStructure(data);
}

export async function getPortfolios(companyId?: string): Promise<Portfolio[]> {
  const data = await getFinancialData(companyId);
  return buildPortfolios(data);
}

export async function getFinancialTableRows(companyId?: string): Promise<TableRow[]> {
  const data = await getFinancialData(companyId);
  return flattenFinancialData(data);
}

export async function askAnalysis(question: string): Promise<AnalysisResponse> {
  await delay(400);
  const q = question.toLowerCase();

  if (q.includes("rentab") || q.includes("moins rentab") || q.includes("portefeuille")) {
    return ANALYSIS_RESPONSES.rentabilite;
  }
  if (q.includes("sinistre") || q.includes("augment")) {
    return ANALYSIS_RESPONSES.sinistres;
  }
  return ANALYSIS_RESPONSES.default;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}