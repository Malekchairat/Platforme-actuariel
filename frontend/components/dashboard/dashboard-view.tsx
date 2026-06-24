"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, HelpCircle } from "lucide-react";
import { BranchBarChart } from "@/components/charts/branch-bar-chart";
import { SinistresLineChart } from "@/components/charts/sinistres-line-chart";
import { StructurePieChart } from "@/components/charts/structure-pie-chart";
import { AppHeader } from "@/components/layout/app-header";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import {
  getBranchComparison,
  getFinancialData,
  getFinancialStructure,
  getKPIs,
  getSinistresEvolution,
} from "@/lib/mock-api";
import { resolveMetricDetail, resolveMetricNumber } from "@/lib/financial-transformers";
import { useAppStore } from "@/lib/store";
import type { ComparisonPoint, FinancialData, KPI, StructureSlice, TimeSeriesPoint } from "@/lib/types";

export function DashboardView() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [sinistresData, setSinistresData] = useState<TimeSeriesPoint[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonPoint[]>([]);
  const [structureData, setStructureData] = useState<StructureSlice[]>([]);
  const [financial, setFinancial] = useState<FinancialData | null>(null);

  const load = useCallback(async (companyId: string) => {
    setLoading(true);
    const [k, s, c, st, f] = await Promise.all([
      getKPIs(companyId),
      getSinistresEvolution(companyId),
      getBranchComparison(companyId),
      getFinancialStructure(companyId),
      getFinancialData(companyId),
    ]);
    setKpis(k);
    setSinistresData(s);
    setComparisonData(c);
    setStructureData(st);
    setFinancial(f);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(selectedCompanyId);
  }, [selectedCompanyId, load]);

  // Safe helper variables for synthesis calculation values
  const nonViePrimes = resolveMetricNumber(financial?.non_vie?.primes_emises);
  const viePrimes = resolveMetricNumber(financial?.vie?.primes_emises);
  const totalPrimes = nonViePrimes + viePrimes;

  const nonVieSinistres = resolveMetricNumber(financial?.non_vie?.charges_sinistres);
  const vieSinistres = resolveMetricNumber(financial?.vie?.charges_sinistres);
  const totalSinistres = nonVieSinistres + vieSinistres;

  const prodFinanciers = resolveMetricNumber(financial?.global?.produits_financiers);
  const primesDetail = resolveMetricDetail(financial?.non_vie?.primes_emises);
  const sinistresDetail = resolveMetricDetail(financial?.non_vie?.charges_sinistres);
  const produitsFinanciersDetail = resolveMetricDetail(financial?.global?.produits_financiers);

  return (
    <>
      <AppHeader
        title="Dashboard"
        description="Vue d'ensemble des indicateurs financiers et techniques"
      />

      <div className="space-y-6 p-8">
        {loading || !financial ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Chargement des données...
          </div>
        ) : (
          <>
            <KpiGrid kpis={kpis} />

            <div className="grid gap-6 lg:grid-cols-2">
              <SinistresLineChart data={sinistresData} />
              <BranchBarChart data={comparisonData} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <StructurePieChart data={structureData} />
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm lg:col-span-2">
                <h3 className="mb-4 text-base font-semibold">Synthèse</h3>
                <dl className="grid gap-4 sm:grid-cols-2">
                  
                  {/* COMPANY NAME */}
                  <div>
                    <dt className="text-sm text-muted-foreground">Compagnie</dt>
                    <dd className="mt-1 font-medium">{financial.company}</dd>
                  </div>

                  {/* NON-LIFE SHARE (WITH HOVER WINDOW) */}
                  <div className="group relative">
                    <dt className="text-sm text-muted-foreground flex items-center gap-1">
                      Part non-vie (primes)
                      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/70" />
                    </dt>
                    <dd className="mt-1 font-medium">
                      {totalPrimes > 0 ? ((nonViePrimes / totalPrimes) * 100).toFixed(1) : "0.0"} %
                    </dd>
                    {/* Interactive Hover Tooltip Box */}
                    <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-72 p-3 bg-slate-900 text-white rounded-lg text-xs shadow-xl border border-slate-700">
                      <p className="font-semibold mb-1 border-b border-slate-700 pb-1 text-sky-400">Provenance d&apos;extraction :</p>
                      <p className="mb-1">📍 <strong>Page N :</strong> Page {primesDetail?.page_n ?? "N/A"}</p>
                      <p className="italic text-slate-300 bg-slate-950 p-1.5 rounded font-mono">
                        &quot;{primesDetail?.snippet_n ?? "Aucun extrait trouvé"}&quot;
                      </p>
                    </div>
                  </div>

                  {/* CLAIMS RATIO (WITH HOVER WINDOW) */}
                  <div className="group relative">
                    <dt className="text-sm text-muted-foreground flex items-center gap-1">
                      Ratio sinistres / primes
                      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/70" />
                    </dt>
                    <dd className="mt-1 font-medium">
                      {totalPrimes > 0 ? ((totalSinistres / totalPrimes) * 100).toFixed(1) : "0.0"} %
                    </dd>
                    {/* Interactive Hover Tooltip Box */}
                    <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-72 p-3 bg-slate-900 text-white rounded-lg text-xs shadow-xl border border-slate-700">
                      <p className="font-semibold mb-1 border-b border-slate-700 pb-1 text-sky-400">Provenance d&apos;extraction :</p>
                      <p className="mb-1">📍 <strong>Page Sinistres :</strong> Page {sinistresDetail?.page_n ?? "N/A"}</p>
                      <p className="italic text-slate-300 bg-slate-950 p-1.5 rounded font-mono">
                        &quot;{sinistresDetail?.snippet_n ?? "Aucun extrait"}&quot;
                      </p>
                    </div>
                  </div>

                  {/* FINANCIAL INVESTMENTS PRODUCTS (WITH HOVER WINDOW) */}
                  <div className="group relative">
                    <dt className="text-sm text-muted-foreground flex items-center gap-1">
                      Produits financiers
                      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/70" />
                    </dt>
                    <dd className="mt-1 font-medium">
                      {(prodFinanciers / 1_000_000).toFixed(1)} M TND
                    </dd>
                    {/* Interactive Hover Tooltip Box */}
                    <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-72 p-3 bg-slate-900 text-white rounded-lg text-xs shadow-xl border border-slate-700">
                      <p className="font-semibold mb-1 border-b border-slate-700 pb-1 text-sky-400">Provenance d&apos;extraction :</p>
                      <p className="mb-1">📍 <strong>Page Bilan Global :</strong> Page {produitsFinanciersDetail?.page_n ?? "N/A"}</p>
                      <p className="italic text-slate-300 bg-slate-950 p-1.5 rounded font-mono">
                        &quot;{produitsFinanciersDetail?.snippet_n ?? "Aucun extrait"}&quot;
                      </p>
                    </div>
                  </div>

                </dl>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}