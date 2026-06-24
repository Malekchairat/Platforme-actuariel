export interface MetricDetail {
  val_n: number | null;
  val_n_1: number | null;
  page_n: number | null;
  page_n_1: number | null;
  snippet_n: string | null;
  snippet_n_1: string | null;
  pct_change: number | null;
  [key: string]: unknown;
}

export type MetricValue = number | MetricDetail | null | undefined;

export interface NonVieData {
  primes_emises: MetricValue;
  primes_acquises: MetricValue;
  charges_sinistres: MetricValue;
  resultat_net: MetricValue;
  provisions_techniques: MetricValue;
  charges_exploitation: MetricValue;
  autres_charges: MetricValue;
}

export interface VieData {
  primes_emises: MetricValue;
  primes_acquises: MetricValue;
  charges_sinistres: MetricValue;
  resultat_net: MetricValue;
  provisions_mathématiques: MetricValue;
}

export interface GlobalData {
  fonds_propres: MetricValue;
  total_bilan: MetricValue;
  produits_financiers: MetricValue;
}

export interface FinancialData {
  company: string;
  non_vie: NonVieData;
  vie: VieData;
  global: GlobalData;
}

export interface KPI {
  id: string;
  label: string;
  value: number;
  unit?: string;
  change?: number;
  changeLabel?: string;
  format?: "currency" | "percent" | "number";
}

export interface TimeSeriesPoint {
  period: string;
  nonVie: number;
  vie: number;
  total: number;
}

export interface ComparisonPoint {
  name: string;
  nonVie: number;
  vie: number;
}

export interface StructureSlice {
  name: string;
  value: number;
  fill?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  branch: "non-vie" | "vie";
  primes: number;
  sinistres: number;
  resultat: number;
  profitability: number;
  riskLevel: "low" | "medium" | "high";
  trend: { period: string; value: number }[];
}

export interface AnalysisResponse {
  answer: string;
  sql: string;
  explanation: string;
}

export interface TableRow {
  label: string;
  value: number;
  section?: string;
  previousValue?: number | null;
  page?: number | null;
  snippet?: string | null;
  pctChange?: number | null;
}
