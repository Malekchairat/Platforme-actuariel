"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Trophy, 
  ArrowUpRight, 
  TrendingUp, 
  DollarSign, 
  Percent, 
  BarChart3, 
  AlertCircle, 
  Sigma, 
  Building2, 
  Car, 
  HeartPulse, 
  ShieldAlert, 
  Layers,
  Flame,
  Ship,
  Briefcase,
  Coins,
  ArrowUpDown
} from "lucide-react";
import { fetchMarketRanking, RankingItem } from "@/lib/api-client"; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { HelpCircle } from "lucide-react";

function SourcePopover({ source }: { source?: RankingItem["source"] }) {
  if (!source) return null;

  return (
    <div className="absolute left-1/2 top-full z-[100] mt-2 hidden w-96 -translate-x-1/2 rounded-xl border border-slate-600 bg-slate-950 p-3 text-[11px] leading-5 text-slate-50 shadow-2xl ring-1 ring-black/40 group-hover:block">
      <p className="mb-2 font-semibold text-cyan-300">Piste d&apos;audit Actuarielle :</p>
      <p className="mb-1">
        📍 <strong>Page Exercice N :</strong> Page {source.page_n ?? "N/A"}
      </p>
      <p className="mb-2 max-w-full overflow-x-auto rounded-md bg-slate-900 p-2 font-mono text-slate-200">
        &quot;{source.snippet_n ?? "N/A"}&quot;
      </p>
      <p className="mb-1">
        📍 <strong>Page Exercice N-1 :</strong> Page {source.page_n_1 ?? "N/A"}
      </p>
      <p className="max-w-full overflow-x-auto rounded-md bg-slate-900 p-2 font-mono text-slate-200">
        &quot;{source.snippet_n_1 ?? "N/A"}&quot;
      </p>
    </div>
  );
}

function ValueWithSource({
  value,
  source,
  formatter,
}: {
  value: number;
  source?: RankingItem["source"];
  formatter: (value: number) => string;
}) {
  return (
    <div className="group relative inline-flex items-center gap-1 pr-4">
      <span>{formatter(value)}</span>
      {source && <HelpCircle className="h-3.5 w-3.5 opacity-40 transition-opacity group-hover:opacity-100" />}
      <SourcePopover source={source} />
    </div>
  );
}

export default function ClassementPage() {
  const [metric, setMetric] = useState<string>("primes_emises");
  const [segment, setSegment] = useState<string>("vue_globale");
  const [rankingData, setRankingData] = useState<RankingItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // States for secondary spreadsheet ratios fetched dynamically
  const [placementData, setPlacementData] = useState<any[]>([]);
  const [creancesData, setCreancesData] = useState<any[]>([]);
  const [assetsCorpData, setAssetsCorpData] = useState<any[]>([]);
  const [rhRatioData, setRhData] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      
      try {
        const [main, placements, creances, corp, rh] = await Promise.all([
          fetchMarketRanking(metric, segment),
          fetchMarketRanking("rendement_placements", "vue_globale"),
          fetchMarketRanking("ratio_creances", "vue_globale"),
          fetchMarketRanking("ratio_actifs_corp", "vue_globale"),
          fetchMarketRanking("charges_personnel_ratio", "vue_globale"),
        ]);

        if (!isMounted) return;

        if (Array.isArray(main)) setRankingData(main);
        if (Array.isArray(placements)) setPlacementData(placements);
        if (Array.isArray(creances)) setCreancesData(creances);
        if (Array.isArray(corp)) setAssetsCorpData(corp);
        if (Array.isArray(rh)) setRhData(rh);

      } catch (err: any) {
        if (!isMounted) return;
        setError("Erreur de synchronisation avec le registre de base PostgreSQL.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, [metric, segment]);

  const stats = useMemo(() => {
    const list = Array.isArray(rankingData) ? rankingData : [];
    if (list.length === 0) return { total: 0, average: 0, leader: "Aucun" };
    const total = list.reduce((sum, item) => sum + item.value, 0);
    return { total, average: total / list.length, leader: list[0]?.company || "Aucun" };
  }, [rankingData]);

  const isPercentageMetric = ["ratio_sp", "taux_effectif_impot", "rendement_placements", "ratio_creances", "ratio_actifs_corp", "charges_personnel_ratio"].includes(metric);

  const formatNumber = (num: number) => {
    if (isPercentageMetric) return `${num.toFixed(2)} %`;
    if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} M TND`;
    return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(num);
  };

  // Build uniform Radar Chart mapping points dynamically for top assets
  const radarChartData = useMemo(() => {
    if (rankingData.length === 0) return [];
    return rankingData.slice(0, 5).map(companyItem => {
      const company = companyItem.company;
      const placementObj = placementData.find(p => p.company === company);
      // CORRECTION DU BUG 7006: Suppression du paramètre parasite 'p'
      const creanceObj = creancesData.find(c => c.company === company);
      const assetsObj = assetsCorpData.find(a => a.company === company);
      const rhObj = rhRatioData.find(r => r.company === company);

      return {
        subject: company.substring(0, 10),
        "Rendement Placements": placementObj ? placementObj.value : 0,
        "Ratio Créances": creanceObj ? creanceObj.value : 0,
        "Actifs Corporels": assetsObj ? assetsObj.value : 0,
        "Frais Personnel": rhObj ? rhObj.value : 0,
      };
    });
  }, [rankingData, placementData, creancesData, assetsCorpData, rhRatioData]);

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1: return <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white font-bold shadow-sm"><Trophy className="w-3 h-3 mr-1" /> 1er</Badge>;
      case 2: return <Badge className="bg-slate-400 text-white font-bold shadow-sm">2e</Badge>;
      case 3: return <Badge className="bg-amber-700 text-white font-bold shadow-sm">3e</Badge>;
      default: return <Badge variant="outline" className="font-medium text-slate-500 bg-background">{rank}e</Badge>;
    }
  };

  const validData = Array.isArray(rankingData) ? rankingData : [];
  const CHART_COLORS = ["#0284c7", "#10b981", "#6366f1", "#8b5cf6", "#f59e0b", "#94a3b8"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto bg-transparent">
      
      {/* HEADER ROW - TRANSPARENT BACKGROUND OVERRIDES */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 text-slate-900 dark:text-white">
            <BarChart3 className="text-sky-600 w-6 h-6" /> Benchmark & Segmentation Sectorielle
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Classement et cartographie des ratios d&apos;après les états financiers réglementaires.
          </p>
        </div>
        
        {/* Branch selectors layout wrapper */}
        <div className="flex flex-wrap gap-2 items-center bg-muted/60 p-1.5 rounded-xl border border-border/40 shrink-0">
          <Tabs value={segment} onValueChange={setSegment} className="w-full sm:w-auto">
            <TabsList className="bg-transparent gap-1">
              <TabsTrigger value="vue_globale" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <Layers className="w-3.5 h-3.5" /> Vue Globale
              </TabsTrigger>
              <TabsTrigger value="automobile" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <Car className="w-3.5 h-3.5 text-blue-500" /> Automobile
              </TabsTrigger>
              <TabsTrigger value="sante" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <HeartPulse className="w-3.5 h-3.5 text-emerald-500" /> Santé
              </TabsTrigger>
              <TabsTrigger value="incendie" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-500" /> Incendie
              </TabsTrigger>
              <TabsTrigger value="transport" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <Ship className="w-3.5 h-3.5 text-cyan-500" /> Transport
              </TabsTrigger>
              <TabsTrigger value="risques_divers" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <SidebarIcon className="w-3.5 h-3.5 text-indigo-500" /> R. Divers
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* CORE INTERACTIVE KPI SELECTION MATRIX MAP GRID */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className={`cursor-pointer border shadow-sm transition-all ${metric === 'primes_emises' ? 'border-sky-600 bg-sky-50/20 dark:bg-sky-950/10 ring-1 ring-sky-600' : 'border-border/50 hover:bg-muted/40'}`} onClick={() => setMetric("primes_emises")}>
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Primes Émises</CardTitle>
            <DollarSign className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0"><p className="text-base font-extrabold text-foreground">Chiffre d&apos;Affaires</p></CardContent>
        </Card>

        <Card className={`cursor-pointer border shadow-sm transition-all ${metric === 'resultat_technique' ? 'border-sky-600 bg-sky-50/20 dark:bg-sky-950/10 ring-1 ring-sky-600' : 'border-border/50 hover:bg-muted/40'}`} onClick={() => setMetric("resultat_technique")}>
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rés. Technique</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0"><p className="text-base font-extrabold text-foreground">Marge Technique</p></CardContent>
        </Card>

        <Card className={`cursor-pointer border shadow-sm transition-all ${metric === 'resultat_net' ? 'border-sky-600 bg-sky-50/20 dark:bg-sky-950/10 ring-1 ring-sky-600' : 'border-border/50 hover:bg-muted/40'}`} onClick={() => setMetric("resultat_net")}>
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Résultat Net</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0"><p className="text-base font-extrabold text-foreground">Bénéfice Net</p></CardContent>
        </Card>

        <Card className={`cursor-pointer border shadow-sm transition-all ${metric === 'ratio_sp' ? 'border-sky-600 bg-sky-50/20 dark:bg-sky-950/10 ring-1 ring-sky-600' : 'border-border/50 hover:bg-muted/40'}`} onClick={() => setMetric("ratio_sp")}>
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ratio S/P</CardTitle>
            <Percent className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0"><p className="text-base font-extrabold text-foreground">Sinistralité (S/P)</p></CardContent>
        </Card>

        <Card className={`cursor-pointer border shadow-sm transition-all ${metric === 'taux_effectif_impot' ? 'border-sky-600 bg-sky-50/20 dark:bg-sky-950/10 ring-1 ring-sky-600' : 'border-border/50 hover:bg-muted/40'}`} onClick={() => setMetric("taux_effectif_impot")}>
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Taux IS Effectif</CardTitle>
            <ShieldAlert className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0"><p className="text-base font-extrabold text-foreground">Pression Fiscale</p></CardContent>
        </Card>
      </div>

      {error && (
        <Alert className="border-amber-200 bg-amber-50/40">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-bold text-xs">Alerte d&apos;Intégration</AlertTitle>
          <AlertDescription className="text-xs mt-0.5">{error}</AlertDescription>
        </Alert>
      )}

      {/* DYNAMIC SPREADSHEETS GRAPH EMBEDDING ZONE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CHART 1: PRIMARY DISTRIBUTION AXIS HISTOGRAM */}
        <Card className="lg:col-span-2 shadow-sm border-border/60">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-sky-600" /> Distribution Sectorielle : {metric.replace(/_/g, " ").toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[280px] pb-3 flex items-center justify-center">
            {isLoading ? (
              <div className="text-xs text-muted-foreground animate-pulse">Synchronisation...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={validData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="company" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tickFormatter={(v) => typeof v === 'number' && !isPercentageMetric && v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "Montant"]} contentStyle={{ backgroundColor: "#0f172a", color: "#fff", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {validData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* CHART 2: MULTI-RATIO COMPARISON — TOP 5 COMPANIES */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <ArrowUpDown className="w-4 h-4 text-indigo-500" /> Comparaison Multi-Ratios — Top 5
            </CardTitle>
            <CardDescription className="text-[10px] mt-1">
              4 indicateurs secondaires pour les 5 premiers du classement
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] pb-3 flex items-center justify-center">
            {isLoading || radarChartData.length === 0 ? (
              <div className="text-xs text-muted-foreground">En attente de chargement...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={radarChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis 
                    dataKey="subject" 
                    tick={{ fontSize: 9, fontWeight: 600 }} 
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis 
                    tick={{ fontSize: 9 }} 
                    label={{ value: '%', angle: -90, position: 'insideLeft', fontSize: 10 }}
                  />
                  <Tooltip 
                    formatter={(value: any) => [`${Number(value).toFixed(2)} %`, ""]}
                    contentStyle={{ 
                      backgroundColor: "#0f172a", 
                      color: "#fff", 
                      borderRadius: "8px", 
                      fontSize: "11px",
                      border: "1px solid #334155"
                    }}
                  />
                  <Bar dataKey="Rendement Placements" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Ratio Créances" fill="#ec4899" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Actifs Corporels" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Frais Personnel" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Legend 
                    wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }}
                    formatter={(value) => <span style={{ color: "#6b7280" }}>{value}</span>}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PREMIUM SPREADSHEET SENSITIVE CARDS LOWER GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-muted/10 border-border/50 shadow-none">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Rendement Placements</CardTitle>
            <Coins className="h-4 w-4 text-cyan-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-lg font-black font-mono text-cyan-600">{placementData[0] ? `${placementData[0].value.toFixed(2)} %` : "0.00 %"}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold truncate">Leader : {placementData[0]?.company || "N/A"}</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/10 border-border/50 shadow-none">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ratio de Créances</CardTitle>
            <Sigma className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-lg font-black font-mono text-orange-600">{creancesData[0] ? `${creancesData[0].value.toFixed(2)} %` : "0.00 %"}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold truncate">Leader : {creancesData[0]?.company || "N/A"}</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/10 border-border/50 shadow-none">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Ratio Actifs Corp.</CardTitle>
            <Building2 className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-lg font-black font-mono text-indigo-600">{assetsCorpData[0] ? `${assetsCorpData[0].value.toFixed(2)} %` : "0.00 %"}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold truncate">Leader : {assetsCorpData[0]?.company || "N/A"}</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/10 border-border/50 shadow-none">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Frais du Personnel</CardTitle>
            <Briefcase className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-lg font-black font-mono text-teal-600">{rhRatioData[0] ? `${rhRatioData[0].value.toFixed(2)} %` : "0.00 %"}</p>
            <p className="text-[10px] text-muted-foreground mt-1 font-semibold truncate">Leader : {rhRatioData[0]?.company || "N/A"}</p>
          </CardContent>
        </Card>
      </div>

      {/* CORE LEADERBOARD WORKSPACE SPREADSHEET */}
      <Card className="shadow-sm border-border/60">
        <CardHeader className="bg-muted/20 pb-3 border-b border-border/40 py-3">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Registre du Leaderboard de Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-xs text-muted-foreground animate-pulse">Chargement de la balance SQL...</div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-28 pl-6 text-xs font-bold uppercase tracking-wider">Rang</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider">Compagnie</TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider">Identifiant Document</TableHead>
                  <TableHead className="text-right pr-6 text-xs font-bold uppercase tracking-wider">Valeur Comptable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validData.map((item, idx) => (
                  <TableRow key={item.file_id || idx} className="hover:bg-muted/20 transition-colors group">
                    <TableCell className="py-3 pl-6 font-semibold">{getRankBadge(item.rank)}</TableCell>
                    <TableCell className="py-3 font-bold text-slate-800 dark:text-slate-200 group-hover:text-sky-600 transition-colors">
                      {item.company}
                    </TableCell>
                    <TableCell className="py-3 text-xs font-mono text-muted-foreground">
                      {item.file_id || "N/A"}
                    </TableCell>
                    <TableCell className="py-3 text-right pr-6 font-black font-mono text-slate-900 dark:text-white">
                      <div className="group relative inline-flex justify-end">
                        <ValueWithSource value={item.value} source={item.source} formatter={formatNumber} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}