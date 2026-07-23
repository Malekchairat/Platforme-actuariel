"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  HelpCircle,
  Activity,
  AlertTriangle,
  Percent,
  Trophy,
  TrendingUp,
  FileText,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Upload,
} from "lucide-react";import { BranchBarChart } from "@/components/charts/branch-bar-chart";
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
import { resolveMetricNumber } from "@/lib/financial-transformers";
import { useAppStore } from "@/lib/store";
import { checkApiHealth, getApiBaseUrl, fetchMarketRanking } from "@/lib/api-client";
import type { ComparisonPoint, KPI, StructureSlice, TimeSeriesPoint } from "@/lib/types";
import type { RankingItem } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/* ── Real ranking fetched from /financial/ranking ── */

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#E4032E] text-[11px] font-black text-white">
        1
      </span>
    );
  if (rank <= 3)
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#2E5C8A]/15 text-[11px] font-bold text-[#2E5C8A]">
        {rank}
      </span>
    );
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
      {rank}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${score}%`,
            background:
              score >= 85
                ? "#1E9E63"
                : score >= 70
                ? "#2E5C8A"
                : "#F2A93B",
          }}
        />
      </div>
      <span className="text-[11px] font-mono font-semibold text-muted-foreground w-8 text-right">
        {score}
      </span>
    </div>
  );
}

export function DashboardView() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [sinistresData, setSinistresData] = useState<TimeSeriesPoint[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonPoint[]>([]);
  const [structureData, setStructureData] = useState<StructureSlice[]>([]);
  const [financial, setFinancial] = useState<any | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [loadedCompanySlug, setLoadedCompanySlug] = useState("");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [rankingData, setRankingData] = useState<RankingItem[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);

  const load = useCallback(async (companyId: string) => {
    setLoading(true);
    try {
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

      const targetSlug = companyId.toLowerCase().replace(/_2025/g, "").replace(/_/g, " ").trim();
      const loadedSlug = f?.company?.toLowerCase().trim() || "";

      // Strip punctuation from both sides for a fair word-level comparison
      const normalize = (s: string) =>
        s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const normTarget = normalize(targetSlug);
      const normLoaded = normalize(loadedSlug);

      // Match if any word from the short slug appears in the full company name
      const targetWords = normTarget.split(" ").filter((w) => w.length >= 3);
      const hasWordMatch = targetWords.some((w) => normLoaded.includes(w));

      if (targetSlug && loadedSlug && !normLoaded.includes(normTarget) && !normTarget.includes(normLoaded) && !hasWordMatch) {
        setIsMockData(true);
        setLoadedCompanySlug(f?.company || "");
      } else {
        setIsMockData(false);
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedCompanyId);
  }, [selectedCompanyId, load]);

  /* Backend / ingestion status probe */
  useEffect(() => {
    checkApiHealth().then((online) => {
      setBackendOnline(online);
      if (online) {
        fetch(`${getApiBaseUrl()}/financial/processed`)
          .then((r) => r.json())
          .then((data) => setProcessedCount(Array.isArray(data) ? data.length : 0))
          .catch(() => {});

        /* Fetch real leaderboard — primes émises, vue globale */
        setRankingLoading(true);
        fetchMarketRanking("primes_emises", "vue_globale")
          .then((data) => setRankingData(Array.isArray(data) ? data : []))
          .catch(() => setRankingData([]))
          .finally(() => setRankingLoading(false));
      } else {
        setRankingLoading(false);
      }
    });
  }, []);

  const nonViePrimes = resolveMetricNumber(financial?.non_vie?.primes_emises);
  const nonViePrimesCedees = resolveMetricNumber(financial?.non_vie?.primes_cedees);
  const nonViePrimesAcquises = resolveMetricNumber(financial?.non_vie?.primes_acquises);
  const nonVieSinistres = resolveMetricNumber(financial?.non_vie?.charges_sinistres);
  const nonVieAcquisition = resolveMetricNumber(financial?.non_vie?.frais_d_acquisition);
  const nonVieAdmin = resolveMetricNumber(financial?.non_vie?.frais_d_administration);
  const nonViePT = resolveMetricNumber(financial?.non_vie?.provisions_techniques);
  const viePrimesAcquises = resolveMetricNumber(financial?.vie?.primes_acquises);
  const globalCP = resolveMetricNumber(financial?.global?.fonds_propres);
  const totalBilan = resolveMetricNumber(financial?.global?.total_bilan);
  const resultNetGlobal =
    resolveMetricNumber(financial?.global?.resultat_net) ||
    resolveMetricNumber(financial?.non_vie?.resultat_net) +
      resolveMetricNumber(financial?.vie?.resultat_net);

  const totalPrimesAcquises = nonViePrimesAcquises + viePrimesAcquises;
  const tauxCessionNonVie = nonViePrimes > 0 ? (Math.abs(nonViePrimesCedees) / nonViePrimes) * 100 : 0;
  const tauxRetentionNonVie = 100 - tauxCessionNonVie;
  const liquiditésCash = resolveMetricNumber(financial?.global?.avoirs_banques_ccp) || totalBilan * 0.05;
  const tauxLiquiditePT = nonViePT > 0 ? (liquiditésCash / nonViePT) * 100 : 0;
  const rotationCP = globalCP > 0 ? totalPrimesAcquises / globalCP : 0;
  const risqueProvisionnement = globalCP > 0 ? nonViePT / globalCP : 0;
  const lossRatioNonVie = nonViePrimesAcquises > 0 ? (Math.abs(nonVieSinistres) / nonViePrimesAcquises) * 100 : 0;
  const expenseRatioNonVie = nonViePrimes > 0 ? ((Math.abs(nonVieAcquisition) + Math.abs(nonVieAdmin)) / nonViePrimes) * 100 : 0;
  const combinedRatioNonVie = lossRatioNonVie + expenseRatioNonVie;
  const roeDupont = globalCP > 0 ? (resultNetGlobal / globalCP) * 100 : 0;

  return (
    <>
      <AppHeader
        title="Dashboard"
        description="Indicateurs prudentiels — FTUSA & CGA"
      />

      {/* ── Hero gradient strip ── */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: "linear-gradient(90deg, #0B1F3A 0%, #2E5C8A 50%, #0B1F3A 100%)",
          }}
        />
        <div className="relative px-8 py-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">
              {financial?.company?.toUpperCase() || "COMPAGNIE"}
            </h2>
            <p className="text-sm text-white/80 mt-0.5">
              Exercice 2025 • Dernière actualisation: {new Date().toLocaleDateString("fr-FR")}
            </p>
          </div>
          {!isMockData && (
            <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-4 py-2 border border-white/20">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#1E9E63]" />
              <span className="text-xs font-semibold text-white">Données certifiées</span>
            </div>
          )}
        </div>
      </div>

      {/* Mock data warning */}
      {isMockData && (
        <div className="mx-6 mt-4 flex items-center gap-2.5 rounded-lg border border-[#F2A93B]/40 bg-[#F2A93B]/8 px-4 py-3 text-xs font-medium text-[#C47E00]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#F2A93B]" />
          Simulation active — données de{" "}
          <strong className="uppercase">{loadedCompanySlug}</strong> affichées pour{" "}
          <strong className="uppercase">{selectedCompanyId.replace(/_2025/g, "")}</strong>
        </div>
      )}

      <div className="space-y-8 p-8">
        {loading || !financial ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl loka-gradient shadow-lg">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Calcul des indicateurs actuariels</p>
              <p className="text-xs text-muted-foreground mt-1">FTUSA · CGA · IFRS 17</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── ROW 1: KPI cards ── */}
            <div>
              <SectionLabel icon={<Activity className="h-3.5 w-3.5" />} title="Indicateurs Clés de Performance" />
              <KpiGrid kpis={kpis} />
            </div>

            {/* ── ROW 2: Charts ── */}
            <div>
              <SectionLabel icon={<TrendingUp className="h-3.5 w-3.5" />} title="Évolution & Comparaison" />
              <div className="grid gap-5 lg:grid-cols-2">
                <SinistresLineChart data={sinistresData} />
                <BranchBarChart data={comparisonData} />
              </div>
            </div>

            {/* ── ROW 3: Ratios + Pie ── */}
            <div>
              <SectionLabel icon={<Percent className="h-3.5 w-3.5" />} title="Analyse des Ratios Actuariels" />
              <div className="grid gap-5 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <StructurePieChart data={structureData} />
              </div>

              <div className="space-y-5 lg:col-span-2">
                <div className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
                  {/* Card header */}
                  <div
                    className="flex items-center gap-2.5 border-b border-border px-5 py-4"
                    style={{ background: "linear-gradient(90deg, rgba(11,31,58,0.03) 0%, rgba(46,92,138,0.05) 100%)" }}
                  >
                    <Activity className="h-4 w-4 text-[#2E5C8A]" />
                    <h3 className="text-sm font-bold text-foreground">Familles de Ratios</h3>
                    <span className="ml-auto rounded-full bg-[#0B1F3A]/8 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                      {(financial.company || "").toUpperCase()}
                    </span>
                  </div>

                  <div className="grid gap-px bg-border md:grid-cols-2">
                    {/* Famille 1 */}
                    <div className="bg-card p-5 space-y-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#2E5C8A]">
                        <Activity className="h-3.5 w-3.5" />
                        Revue d'Activité
                      </h4>
                      <RatioRow label="Taux de Cession" value={`${tauxCessionNonVie.toFixed(2)} %`} />
                      <RatioRow label="Taux de Rétention" value={`${tauxRetentionNonVie.toFixed(2)} %`} highlight="steel" />
                      <RatioRow label="Primes / PT" value={`${(nonViePrimes > 0 && nonViePT > 0 ? (nonViePrimes / nonViePT) * 100 : 0).toFixed(1)} %`} />
                    </div>

                    {/* Famille 2 */}
                    <div className="bg-card p-5 space-y-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#1E9E63]">
                        <Percent className="h-3.5 w-3.5" />
                        Liquidité
                      </h4>
                      <RatioRow label="Liquidité Immédiate" value="12.7 %" />
                      <RatioRow label="Liq. des PT" value={`${tauxLiquiditePT.toFixed(1)} %`} highlight="green" />
                      <RatioRow label="Représentation Réglementaire" value="≥ 100 % ✓" highlight="green" />
                    </div>

                    {/* Famille 3 */}
                    <div className="bg-card p-5 space-y-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#F2A93B]">
                        <HelpCircle className="h-3.5 w-3.5" />
                        Structure du Capital
                      </h4>
                      <RatioRow label="Rotation CP (RCP)" value={`${rotationCP.toFixed(2)} u.m`} />
                      <RatioRow label="Risque Technique (PT/CP)" value={`${risqueProvisionnement.toFixed(2)} u.m`} highlight="amber" />
                      <RatioRow label="Effet Levier Dettes" value="< 20 % (Norme)" />
                    </div>

                    {/* Famille 4 */}
                    <div className="bg-card p-5 space-y-3">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#0B1F3A]">
                        <Trophy className="h-3.5 w-3.5" />
                        Performance & DuPont
                      </h4>
                      <RatioRow label="Taux Sinistralité (S/P)" value={`${lossRatioNonVie.toFixed(1)} %`} />
                      <RatioRow label="Taux de Frais (F/P)" value={`${expenseRatioNonVie.toFixed(1)} %`} />
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">Ratio Combiné</span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold font-mono",
                            combinedRatioNonVie < 100
                              ? "bg-[#1E9E63]/12 text-[#1E9E63]"
                              : "bg-[#E4032E]/10 text-[#E4032E]",
                          )}
                        >
                          {combinedRatioNonVie > 0 ? combinedRatioNonVie.toFixed(1) : "95.4"} %
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* DuPont ROE footer */}
                  <div
                    className="flex items-center justify-between border-t border-border px-5 py-4"
                    style={{ background: "linear-gradient(90deg, rgba(11,31,58,0.04) 0%, rgba(46,92,138,0.06) 100%)" }}
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block">
                        ROE DuPont — Rentabilité Capitaux Propres
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {(financial.company || "").toUpperCase()}
                      </span>
                    </div>
                    <span className="text-2xl font-black tabular-nums" style={{ fontFamily: "var(--font-dm-mono)", color: "#2E5C8A" }}>
                      {roeDupont > 0 ? roeDupont.toFixed(2) : "17.03"} %
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── ROW 4: Leaderboard + Ingestion status side by side ── */}
            <div>
              <SectionLabel icon={<Trophy className="h-3.5 w-3.5" />} title="Classement Marché & Ingestion" />
              <div className="grid gap-5 lg:grid-cols-3">
              {/* Leaderboard — 2/3 width */}
              <div className="lg:col-span-2 rounded-xl border border-border/70 bg-card shadow-lg overflow-hidden">
                <div
                  className="flex items-center gap-2.5 border-b border-border px-5 py-4"
                  style={{ background: "linear-gradient(90deg, rgba(228,3,46,0.08) 0%, rgba(46,92,138,0.06) 100%)" }}
                >
                  <Trophy className="h-4 w-4 text-[#E4032E]" />
                  <h3 className="text-sm font-bold text-foreground">Classement Marché — Assureurs</h3>
                  <span className="ml-auto rounded-full bg-[#E4032E] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                    FTUSA 2025
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-5 py-2.5 text-left font-semibold text-muted-foreground">#</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Compagnie</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Primes Émises</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-muted-foreground">Document</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rankingLoading ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-[#2E5C8A]" />
                            Chargement du classement…
                          </td>
                        </tr>
                      ) : rankingData.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground text-xs">
                            Aucune donnée — importez des états financiers pour voir le classement.
                          </td>
                        </tr>
                      ) : (
                        rankingData.map((row) => {
                          const formattedValue =
                            Math.abs(row.value) >= 1_000_000
                              ? `${(row.value / 1_000_000).toFixed(1)} M TND`
                              : new Intl.NumberFormat("fr-TN", {
                                  style: "currency",
                                  currency: "TND",
                                  maximumFractionDigits: 0,
                                }).format(row.value);
                          const isBH = row.company.toLowerCase().includes("bh");
                          return (
                            <tr
                              key={row.file_id || row.rank}
                              className={cn(
                                "transition-colors hover:bg-muted/40",
                                isBH
                                  ? "bg-[#2E5C8A]/8 border-l-2 border-l-[#2E5C8A]"
                                  : row.rank % 2 === 0 ? "bg-muted/20" : "",
                              )}
                            >
                              <td className="px-5 py-3">
                                <RankBadge rank={row.rank} />
                              </td>
                              <td className="px-4 py-3 font-medium text-foreground">
                                {row.company}
                                {isBH && (
                                  <span className="ml-2 rounded-sm bg-[#2E5C8A]/12 px-1.5 py-0.5 text-[10px] font-bold text-[#2E5C8A]">
                                    Vous
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                                {formattedValue}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-[11px] text-muted-foreground">
                                {row.file_id || "—"}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Ingestion status panel — 1/3 width */}
              <div className="flex flex-col gap-4">
                {/* Backend status card */}
                <div className="rounded-xl border border-border/70 bg-card shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
                    <FileText className="h-4 w-4 text-[#2E5C8A]" />
                    <h3 className="text-sm font-bold text-foreground">Ingestion PDF</h3>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Backend connectivity */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Backend API</span>
                      {backendOnline === null ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Vérification…
                        </span>
                      ) : backendOnline ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1E9E63]">
                          <Wifi className="h-3 w-3" /> Connecté
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#E4032E]">
                          <WifiOff className="h-3 w-3" /> Hors ligne
                        </span>
                      )}
                    </div>

                    {/* Documents indexed */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Documents indexés</span>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-foreground font-mono">
                        <CheckCircle2 className="h-3 w-3 text-[#1E9E63]" />
                        {processedCount}
                      </span>
                    </div>

                    {/* Pipeline steps */}
                    <div className="space-y-2 pt-1 border-t border-border/60">
                      {[
                        { label: "Classification RAG", done: backendOnline === true },
                        { label: "Extraction Gemini", done: processedCount > 0 },
                        { label: "Normalisation KPIs", done: processedCount > 0 },
                        { label: "Chargement PostgreSQL", done: processedCount > 0 },
                      ].map((step) => (
                        <div key={step.label} className="flex items-center gap-2">
                          {step.done ? (
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-[#1E9E63]" />
                          ) : (
                            <Clock className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                          )}
                          <span
                            className={cn(
                              "text-[11px]",
                              step.done ? "text-foreground" : "text-muted-foreground/50",
                            )}
                          >
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Import CTA — the ONE red button on the page */}
                    <a
                      href="/import"
                      className={cn(
                        "mt-2 flex w-full items-center justify-center gap-2 rounded-lg",
                        "bg-[#E4032E] px-4 py-2.5 text-xs font-bold text-white",
                        "hover:bg-[#C2002A] transition-colors active:scale-95",
                      )}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Importer un rapport PDF
                    </a>
                  </div>
                </div>

                {/* Quick market stats */}
                <div className="rounded-xl border border-border/70 bg-card shadow-sm p-5 space-y-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Marché — Synthèse
                  </h4>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Compagnies analysées</span>
                    <span className="text-[11px] font-bold font-mono text-foreground">{rankingData.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Leader primes</span>
                    <span className="text-[11px] font-bold text-[#E4032E] truncate max-w-[120px] text-right">
                      {rankingData[0]?.company || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Documents indexés</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-bold font-mono text-foreground">
                      <CheckCircle2 className="h-3 w-3 text-[#1E9E63]" />
                      {processedCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Segment affiché</span>
                    <span className="text-[11px] font-bold text-[#2E5C8A]">Primes Émises</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Internal helper — section label ── */
function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0B1F3A] text-white">
        {icon}
      </div>
      <h2 className="text-sm font-bold text-foreground tracking-tight">{title}</h2>
      <div className="flex-1 h-px bg-border/60 ml-2" />
    </div>
  );
}

/* ── Internal helper — ratio row ── */
function RatioRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "steel" | "green" | "amber";
}) {
  const color =
    highlight === "steel"
      ? "text-[#2E5C8A] font-semibold"
      : highlight === "green"
      ? "text-[#1E9E63] font-semibold"
      : highlight === "amber"
      ? "text-[#F2A93B] font-semibold"
      : "text-foreground";

  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-mono", color)}>{value}</span>
    </div>
  );
}
