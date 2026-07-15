import type {
  ComparisonPoint,
  FinancialData,
  KPI,
  Portfolio,
  MetricSource,
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

// --- DICTIONNAIRE DES GROUPES (SMART MERGE) ---
export const INSURANCE_GROUPS: Record<string, { nonVie: string; vie: string; name: string }> = {
  "COMAR": { nonVie: "COMAR", vie: "HAYETT", name: "GROUPE COMAR" },
  "HAYETT": { nonVie: "COMAR", vie: "HAYETT", name: "GROUPE COMAR" },
  "GAT": { nonVie: "GAT", vie: "GAT_VIE", name: "GROUPE GAT" },
  "GAT_VIE": { nonVie: "GAT", vie: "GAT_VIE", name: "GROUPE GAT" },
  "MAGHREBIA": { nonVie: "MAGHREBIA", vie: "MAGHREBIA_VIE", name: "GROUPE MAGHREBIA" },
  "MAGHREBIA_VIE": { nonVie: "MAGHREBIA", vie: "MAGHREBIA_VIE", name: "GROUPE MAGHREBIA" },
  "CARTE": { nonVie: "CARTE", vie: "CARTE_VIE", name: "GROUPE CARTE" },
  "CARTE_VIE": { nonVie: "CARTE", vie: "CARTE_VIE", name: "GROUPE CARTE" },
  "LLOYD": { nonVie: "LLOYD", vie: "LLOYD_VIE", name: "GROUPE LLOYD" },
  "LLOYD_VIE": { nonVie: "LLOYD", vie: "LLOYD_VIE", name: "GROUPE LLOYD" },
};

// --- FONCTION DE FUSION (GROUPE) ---
export function mergeFinancialData(dataA: any, dataB: any): any {
  if (!dataA) return dataB;
  if (!dataB) return dataA;

  const merged = JSON.parse(JSON.stringify(dataA));

  const branches = ["vie", "non_vie", "automobile", "sante", "incendie", "transport", "risques_divers"];
  branches.forEach(branch => {
    if (!merged[branch] && dataB[branch]) merged[branch] = dataB[branch];
  });

  if (dataB.global) {
    merged.global = merged.global || {};
    const globalKeys = [
      "fonds_propres", "total_bilan", "produits_financiers", "impot_sur_les_benefices", 
      "effectif", "charges_personnel", "creances", "actifs_corporels_incorporels", 
      "placements_bruts", "placements_nets", "resultat_net"
    ];
    
    globalKeys.forEach(key => {
      const valA = resolveMetricNumber(merged.global[key]);
      const valB = resolveMetricNumber(dataB.global[key]);
      if (valA || valB) {
        merged.global[key] = { val_n: valA + valB };
      }
    });
  }

  return merged;
}

// --- Fonctions d'extraction sécurisées ---
export function resolveMetricNumber(metric: any): number {
  if (!metric) return 0;
  if (typeof metric === "object" && metric.val_n !== undefined && metric.val_n !== null) {
    return Number(metric.val_n);
  }
  if (typeof metric === "number") return metric;
  return 0;
}

export function resolveMetricNumberPast(metric: any): number {
  if (!metric) return 0;
  if (typeof metric === "object" && metric.val_n_1 !== undefined && metric.val_n_1 !== null) {
    return Number(metric.val_n_1);
  }
  return 0;
}

export function resolveMetricDetail(metric: any) {
  if (metric && typeof metric === "object") {
    return {
      page_n: metric.page_n ?? "N/A",
      page_n_1: metric.page_n_1 ?? "N/A",
      snippet_n: metric.snippet_n ?? "Aucun extrait trouvé",
      snippet_n_1: metric.snippet_n_1 ?? "Aucun extrait trouvé",
      pct_change: metric.pct_change ?? null,
    };
  }
  return {
    page_n: "N/A",
    page_n_1: "N/A",
    snippet_n: "Aucun extrait trouvé",
    snippet_n_1: "Aucun extrait trouvé",
    pct_change: null,
  };
}

export function formatCurrency(value: number): string {
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
  return `${value.toFixed(1)} %`;
}

function resolveMetricSource(metric: any): MetricSource {
  const detail = resolveMetricDetail(metric);
  return {
    page_n: detail.page_n,
    page_n_1: detail.page_n_1,
    snippet_n: detail.snippet_n,
    snippet_n_1: detail.snippet_n_1,
    pct_change: detail.pct_change,
  };
}

export function extractKPIs(data: any): KPI[] {
  const primesEmises = resolveMetricNumber(data?.non_vie?.primes_emises) + resolveMetricNumber(data?.vie?.primes_emises);
  const sinistres = resolveMetricNumber(data?.non_vie?.charges_sinistres) + resolveMetricNumber(data?.vie?.charges_sinistres);
  const resultatTechnique = resolveMetricNumber(data?.non_vie?.resultat_technique) + resolveMetricNumber(data?.vie?.resultat_technique);
  const fondsPropres = resolveMetricNumber(data?.global?.fonds_propres);
  const totalBilan = resolveMetricNumber(data?.global?.total_bilan);
  const resultatNet = resolveMetricNumber(data?.global?.resultat_net) || resolveMetricNumber(data?.non_vie?.resultat_net) + resolveMetricNumber(data?.vie?.resultat_net);

  const roe = fondsPropres > 0 ? (resultatNet / fondsPropres) * 100 : 0;
  
  const effectif = resolveMetricNumber(data?.global?.effectif);
  const masseSalariale = resolveMetricNumber(data?.global?.charges_personnel);
  const coutSalarie = effectif > 0 ? (masseSalariale / effectif) : 0;

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
      id: "resultat",
      label: "Résultat technique",
      value: resultatTechnique,
      change: -2.1,
      changeLabel: "vs N-1",
      format: "currency",
    },
    {
      id: "roe",
      label: "ROE (Rentabilité FP)",
      value: roe,
      change: 1.5,
      changeLabel: "vs N-1",
      format: "percent",
    },
    {
      id: "fonds",
      label: "Fonds propres",
      value: fondsPropres,
      change: 3.5,
      changeLabel: "vs N-1",
      format: "currency",
    },
    {
      id: "cout_rh",
      label: "Coût moy. Salarié",
      value: Math.abs(coutSalarie),
      change: 0,
      changeLabel: "Annuel",
      format: "currency",
    },
  ];
}

export function buildSinistresTimeSeries(data: any): TimeSeriesPoint[] {
  const baseNonVie = resolveMetricNumber(data?.non_vie?.charges_sinistres);
  const baseVie = resolveMetricNumber(data?.vie?.charges_sinistres);
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

export function buildBranchComparison(data: any): ComparisonPoint[] {
  return [
    {
      name: "Primes",
      nonVie: resolveMetricNumber(data?.non_vie?.primes_emises),
      vie: resolveMetricNumber(data?.vie?.primes_emises),
    },
    {
      name: "Sinistres",
      nonVie: resolveMetricNumber(data?.non_vie?.charges_sinistres),
      vie: resolveMetricNumber(data?.vie?.charges_sinistres),
    },
    {
      name: "Résultat",
      nonVie: resolveMetricNumber(data?.non_vie?.resultat_technique),
      vie: resolveMetricNumber(data?.vie?.resultat_technique),
    },
    {
      name: "Provisions",
      nonVie: resolveMetricNumber(data?.non_vie?.provisions_techniques),
      vie: resolveMetricNumber(data?.vie?.provisions_mathématiques),
    },
  ];
}

export function buildFinancialStructure(data: any): StructureSlice[] {
  const tBilan = resolveMetricNumber(data?.global?.total_bilan);
  const fPropres = resolveMetricNumber(data?.global?.fonds_propres);
  const nvPT = resolveMetricNumber(data?.non_vie?.provisions_techniques);
  const vPM = resolveMetricNumber(data?.vie?.provisions_mathématiques);

  const autresActifs = tBilan - fPropres - nvPT - vPM;

  return [
    { name: "Fonds propres", value: fPropres, fill: CHART_COLORS[0] },
    { name: "Provisions non-vie", value: nvPT, fill: CHART_COLORS[1] },
    { name: "Provisions vie", value: vPM, fill: CHART_COLORS[2] },
    { name: "Autres actifs", value: Math.max(autresActifs, 0), fill: CHART_COLORS[3] },
  ];
}

export function flattenFinancialData(data: any): TableRow[] {
  const rows: TableRow[] = [];

  const pushSection = (section: string, sectionObj: any) => {
    if (!sectionObj || typeof sectionObj !== "object") return;
    for (const [key, item] of Object.entries(sectionObj)) {
      const val = resolveMetricNumber(item);
      rows.push({
        label: key.replace(/_/g, " "),
        value: val,
        section,
      });
    }
  };

  pushSection("Non-vie", data?.non_vie);
  pushSection("Vie", data?.vie);
  pushSection("Global", data?.global);

  return rows;
}

export function buildPortfolios(data: any): Portfolio[] {
  const branchLabels: Record<string, { branch: Portfolio["branch"]; name: string }> = {
    automobile: { branch: "non-vie", name: "Automobile" },
    sante: { branch: "non-vie", name: "Santé" },
    incendie: { branch: "non-vie", name: "Incendie" },
    transport: { branch: "non-vie", name: "Transport" },
    risques_divers: { branch: "non-vie", name: "Autres Risques Divers" },
    non_vie: { branch: "non-vie", name: "Total Non-vie" },
    vie: { branch: "vie", name: "Total Vie" },
  };

  const branchEntries = Object.entries(data ?? {}).filter(
    ([key, value]) =>
      key !== "company" && key !== "global" && value && typeof value === "object",
  );

  const portfolios = branchEntries
    .filter(([key]) => key in branchLabels)
    .map(([key, section], index) => {
      const branchInfo = branchLabels[key];
      const primesMetric = (section as any).primes_emises ?? (section as any).primes_acquises;
      const sinistresMetric = (section as any).charges_sinistres;
      const resultMetric =
        (section as any).resultat_technique ?? (section as any).resultat_net ?? null;

      const primes = resolveMetricNumber(primesMetric);
      const sinistres = resolveMetricNumber(sinistresMetric);
      const resultat = resolveMetricNumber(resultMetric);
      const profitability = primes > 0 ? (resultat / primes) * 100 : 0;
      const riskLevel: Portfolio["riskLevel"] =
        branchInfo.branch === "non-vie"
          ? profitability < 0.5
            ? "high"
            : profitability < 2
              ? "medium"
              : "low"
          : profitability < 5
            ? "medium"
            : "low";

      return {
        id: `${key}-${index}`,
        name: branchInfo.name,
        branch: branchInfo.branch,
        primes,
        sinistres,
        resultat,
        profitability,
        riskLevel,
        trend: buildMetricTrend(primesMetric, primes),
        primesSource: primesMetric ? resolveMetricSource(primesMetric) : undefined,
        sinistresSource: sinistresMetric ? resolveMetricSource(sinistresMetric) : undefined,
        resultatSource: resultMetric ? resolveMetricSource(resultMetric) : undefined,
      };
    });

  return portfolios.sort((left, right) => {
    if (left.branch !== right.branch) return left.branch === "non-vie" ? -1 : 1;
    return left.name.localeCompare(right.name, "fr");
  });
}

function buildMetricTrend(metric: any, fallbackBase: number) {
  const current = resolveMetricNumber(metric);
  const previous = resolveMetricNumberPast(metric);

  if (current > 0 && previous > 0) {
    const periods = ["Jan", "Fév", "Mar", "Avr", "Mai"];
    const steps = periods.length - 1;
    return periods.map((period, index) => ({
      period,
      value: Math.round(previous + ((current - previous) * index) / steps),
    }));
  }

  const factors = [0.85, 0.9, 0.95, 1.0, 1.05];
  const base = fallbackBase > 0 ? fallbackBase : current;
  return ["Jan", "Fév", "Mar", "Avr", "Mai"].map((period, i) => ({
    period,
    value: Math.round(base * factors[i]),
  }));
}