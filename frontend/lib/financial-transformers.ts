import type {
  ComparisonPoint,
  FinancialData,
  KPI,
  Portfolio,
  MetricDetail,
  MetricValue,
  StructureSlice,
  TableRow,
  TimeSeriesPoint,
} from "./types";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)} Md TND`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} M TND`;
  }
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(1)} %`;
}

export function resolveMetricNumber(metric: MetricValue, fallback = 0): number {
  if (typeof metric === "number") {
    return Number.isFinite(metric) ? metric : fallback;
  }

  if (metric && typeof metric === "object") {
    const current = metric.val_n;
    if (typeof current === "number" && Number.isFinite(current)) {
      return current;
    }
  }

  return fallback;
}

export function resolveMetricDetail(metric: MetricValue): MetricDetail | null {
  if (metric && typeof metric === "object") {
    return metric;
  }

  return null;
}

export function extractKPIs(data: FinancialData): KPI[] {
  const primesEmises =
    resolveMetricNumber(data.non_vie.primes_emises) +
    resolveMetricNumber(data.vie.primes_emises);
  const sinistres =
    resolveMetricNumber(data.non_vie.charges_sinistres) +
    resolveMetricNumber(data.vie.charges_sinistres);
  const resultatTechnique =
    resolveMetricNumber(data.non_vie.resultat_net) +
    resolveMetricNumber(data.vie.resultat_net);

  return [
    {
      id: "primes",
      label: "Primes émises",
      value: primesEmises,
      change: 4.2,
      changeLabel: "vs N-1",
      format: "currency",
    },
    {
      id: "sinistres",
      label: "Sinistres",
      value: sinistres,
      change: 6.8,
      changeLabel: "vs N-1",
      format: "currency",
    },
    {
      id: "resultat",
      label: "Résultat technique",
      value: resultatTechnique,
      change: -2.1,
      changeLabel: "vs N-1",
      format: "currency",
    },
    {
      id: "fonds",
      label: "Fonds propres",
      value: data.global.fonds_propres,
      change: 3.5,
      changeLabel: "vs N-1",
      format: "currency",
    },
    {
      id: "bilan",
      label: "Total bilan",
      value: resolveMetricNumber(data.global.total_bilan),
      change: 5.1,
      changeLabel: "vs N-1",
      format: "currency",
    },
  ];
}

export function buildSinistresTimeSeries(data: FinancialData): TimeSeriesPoint[] {
  const baseNonVie = resolveMetricNumber(data.non_vie.charges_sinistres);
  const baseVie = resolveMetricNumber(data.vie.charges_sinistres);
  const periods = ["T1 2024", "T2 2024", "T3 2024", "T4 2024", "T1 2025"];

  const factors = [0.82, 0.88, 0.93, 0.97, 1.0];

  return periods.map((period, i) => {
    const nonVie = Math.round(baseNonVie * factors[i]);
    const vie = Math.round(baseVie * factors[i]);
    return {
      period,
      nonVie,
      vie,
      total: nonVie + vie,
    };
  });
}

export function buildBranchComparison(data: FinancialData): ComparisonPoint[] {
  return [
    {
      name: "Primes",
      nonVie: resolveMetricNumber(data.non_vie.primes_emises),
      vie: resolveMetricNumber(data.vie.primes_emises),
    },
    {
      name: "Sinistres",
      nonVie: resolveMetricNumber(data.non_vie.charges_sinistres),
      vie: resolveMetricNumber(data.vie.charges_sinistres),
    },
    {
      name: "Résultat",
      nonVie: resolveMetricNumber(data.non_vie.resultat_net),
      vie: resolveMetricNumber(data.vie.resultat_net),
    },
    {
      name: "Provisions",
      nonVie: resolveMetricNumber(data.non_vie.provisions_techniques),
      vie: resolveMetricNumber(data.vie.provisions_mathématiques),
    },
  ];
}

export function buildFinancialStructure(data: FinancialData): StructureSlice[] {
  const fondsPropres = resolveMetricNumber(data.global.fonds_propres);
  const totalBilan = resolveMetricNumber(data.global.total_bilan);
  const provisionsNonVie = resolveMetricNumber(data.non_vie.provisions_techniques);
  const provisionsVie = resolveMetricNumber(data.vie.provisions_mathématiques);

  const autresActifs =
    totalBilan - fondsPropres - provisionsNonVie - provisionsVie;

  return [
    { name: "Fonds propres", value: fondsPropres, fill: CHART_COLORS[0] },
    {
      name: "Provisions non-vie",
      value: provisionsNonVie,
      fill: CHART_COLORS[1],
    },
    {
      name: "Provisions vie",
      value: provisionsVie,
      fill: CHART_COLORS[2],
    },
    { name: "Autres actifs", value: Math.max(autresActifs, 0), fill: CHART_COLORS[3] },
  ];
}

export function flattenFinancialData(data: FinancialData): TableRow[] {
  const rows: TableRow[] = [];

  const pushSection = (section: string, entries: Record<string, MetricValue>) => {
    for (const [key, value] of Object.entries(entries)) {
      const detail = resolveMetricDetail(value);
      rows.push({
        label: key.replace(/_/g, " "),
        value: resolveMetricNumber(value),
        section,
        previousValue: detail?.val_n_1 ?? null,
        page: detail?.page_n ?? null,
        snippet: detail?.snippet_n ?? null,
        pctChange: detail?.pct_change ?? null,
      });
    }
  };

  pushSection("Non-vie", data.non_vie as unknown as Record<string, MetricValue>);
  pushSection("Vie", data.vie as unknown as Record<string, MetricValue>);
  pushSection("Global", data.global as unknown as Record<string, MetricValue>);

  return rows;
}

export function buildPortfolios(data: FinancialData): Portfolio[] {
  const nonVieSegments = [
    { name: "Automobile", share: 0.38 },
    { name: "Multirisques", share: 0.22 },
    { name: "Responsabilité civile", share: 0.15 },
    { name: "Transport", share: 0.12 },
    { name: "Incendie", share: 0.13 },
  ];

  const vieSegments = [
    { name: "Épargne", share: 0.45 },
    { name: "Retraite", share: 0.3 },
    { name: "Décès", share: 0.25 },
  ];

  const nonViePortfolios = nonVieSegments.map((seg, i) => {
    const primes = Math.round(resolveMetricNumber(data.non_vie.primes_emises) * seg.share);
    const sinistres = Math.round(resolveMetricNumber(data.non_vie.charges_sinistres) * seg.share);
    const resultat = Math.round(resolveMetricNumber(data.non_vie.resultat_net) * seg.share);
    const profitability = primes > 0 ? (resultat / primes) * 100 : 0;
    const riskLevel: Portfolio["riskLevel"] =
      profitability < 0.5 ? "high" : profitability < 2 ? "medium" : "low";

    return {
      id: `nv-${i}`,
      name: seg.name,
      branch: "non-vie" as const,
      primes,
      sinistres,
      resultat,
      profitability,
      riskLevel,
      trend: buildMiniTrend(sinistres),
    };
  });

  const viePortfolios = vieSegments.map((seg, i) => {
    const primes = Math.round(resolveMetricNumber(data.vie.primes_emises) * seg.share);
    const sinistres = Math.round(resolveMetricNumber(data.vie.charges_sinistres) * seg.share);
    const resultat = Math.round(resolveMetricNumber(data.vie.resultat_net) * seg.share);
    const profitability = primes > 0 ? (resultat / primes) * 100 : 0;
    const riskLevel: Portfolio["riskLevel"] = profitability < 5 ? "medium" : "low";

    return {
      id: `v-${i}`,
      name: seg.name,
      branch: "vie" as const,
      primes,
      sinistres,
      resultat,
      profitability,
      riskLevel,
      trend: buildMiniTrend(primes),
    };
  });

  return [...nonViePortfolios, ...viePortfolios];
}

function buildMiniTrend(base: number) {
  const factors = [0.85, 0.9, 0.95, 1.0, 1.05];
  return ["Jan", "Fév", "Mar", "Avr", "Mai"].map((period, i) => ({
    period,
    value: Math.round(base * factors[i]),
  }));
}
