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
  PieChart as PieIcon, 
  Car, 
  HeartPulse, 
  ShieldAlert, 
  Layers 
} from "lucide-react";
import { fetchMarketRanking, RankingItem } from "@/lib/api-client"; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";

export default function ClassementPage() {
  const [metric, setMetric] = useState<string>("primes_emises");
  const [segment, setSegment] = useState<string>("vue_globale");
  const [rankingData, setRankingData] = useState<RankingItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      
      try {
        const data = await fetchMarketRanking(metric, segment);
        if (!isMounted) return;

        if (Array.isArray(data)) {
          setRankingData(data);
        } else {
          throw new Error("L'API n'a pas renvoyé un tableau valide.");
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("Mode fallback activé suite à l'absence de données réelles :", err.message);
        setError("Affichage des données de simulation actuarielle. Connectez et démarrez le backend pour synchroniser les extractions de la base PostgreSQL en direct.");
        
        // Génération d'un jeu de données de simulation ultra-complet pour toutes les branches
        let baseMultiplier = 1;
        if (segment === "automobile") baseMultiplier = 0.45;
        else if (segment === "sante") baseMultiplier = 0.25;
        else if (segment === "risques_divers") baseMultiplier = 0.20;

        let mockData: RankingItem[] = [];

        if (metric === "primes_emises") {
          mockData = [
            { company: "GAT ASSURANCES", value: 285886354 * baseMultiplier, file_id: "GAT_2025", rank: 1 },
            { company: "COMAR", value: 273345982 * baseMultiplier, file_id: "COMAR_2025", rank: 2 },
            { company: "MAGHREBIA", value: 293448347 * baseMultiplier, file_id: "MAGHREBIA_2025", rank: 3 },
            { company: "BIAT ASSURANCE", value: 208346299 * baseMultiplier, file_id: "BIAT_2025", rank: 4 },
            { company: "BNA ASSURANCES", value: 146264097 * baseMultiplier, file_id: "BNA_2025", rank: 5 },
            { company: "ASTREE", value: 90937720 * baseMultiplier, file_id: "ASTREE_2025", rank: 6 },
          ];
        } else if (metric === "resultat_technique") {
          mockData = [
            { company: "COMAR", value: 72204915 * baseMultiplier, file_id: "COMAR_2025", rank: 1 },
            { company: "GAT ASSURANCES", value: 33152936 * baseMultiplier, file_id: "GAT_2025", rank: 2 },
            { company: "MAGHREBIA", value: 17210192 * baseMultiplier, file_id: "MAGHREBIA_2025", rank: 3 },
            { company: "BNA ASSURANCES", value: 13037853 * baseMultiplier, file_id: "BNA_2025", rank: 4 },
            { company: "BIAT ASSURANCE", value: 12202000 * baseMultiplier, file_id: "BIAT_2025", rank: 5 },
            { company: "ASTREE", value: 5430000 * baseMultiplier, file_id: "ASTREE_2025", rank: 6 },
          ];
        } else if (metric === "resultat_net") {
          mockData = [
            { company: "COMAR", value: 82150543, file_id: "COMAR_2025", rank: 1 },
            { company: "MAGHREBIA", value: 43432196, file_id: "MAGHREBIA_2025", rank: 2 },
            { company: "GAT ASSURANCES", value: 35683697, file_id: "GAT_2025", rank: 3 },
            { company: "BNA ASSURANCES", value: 17045881, file_id: "BNA_2025", rank: 4 },
            { company: "BIAT ASSURANCE", value: 14380000, file_id: "BIAT_2025", rank: 5 },
            { company: "ASTREE", value: 8742535, file_id: "ASTREE_2025", rank: 6 },
          ];
        } else if (metric === "ratio_sp") {
          // Pour le S/P, simulation de pourcentages réalistes par branche
          const offset = segment === "automobile" ? 12 : (segment === "sante" ? 8 : -5);
          mockData = [
            { company: "BNA ASSURANCES", value: 61.2 + offset, file_id: "BNA_2025", rank: 1 },
            { company: "COMAR", value: 64.1 + offset, file_id: "COMAR_2025", rank: 2 },
            { company: "GAT ASSURANCES", value: 66.5 + offset, file_id: "GAT_2025", rank: 3 },
            { company: "ASTREE", value: 68.9 + offset, file_id: "ASTREE_2025", rank: 4 },
            { company: "MAGHREBIA", value: 71.3 + offset, file_id: "MAGHREBIA_2025", rank: 5 },
            { company: "BIAT ASSURANCE", value: 74.8 + offset, file_id: "BIAT_2025", rank: 6 },
          ];
        } else if (metric === "taux_effectif_impot") {
          // Simulation du taux effectif d'impôt (IS / Résultat Brut)
          mockData = [
            { company: "ASTREE", value: 31.4, file_id: "ASTREE_2025", rank: 1 },
            { company: "GAT ASSURANCES", value: 29.6, file_id: "GAT_2025", rank: 2 },
            { company: "COMAR", value: 24.8, file_id: "COMAR_2025", rank: 3 },
            { company: "BNA ASSURANCES", value: 22.1, file_id: "BNA_2025", rank: 4 },
            { company: "MAGHREBIA", value: 19.5, file_id: "MAGHREBIA_2025", rank: 5 },
            { company: "BIAT ASSURANCE", value: 18.2, file_id: "BIAT_2025", rank: 6 },
          ];
        }

        // Tri adaptatif : le Ratio S/P le plus bas représente la meilleure performance technique,
        // mais pour garder un leaderboard homogène, on ordonne par valeur selon les règles métiers.
        const sortedData = [...mockData]
          .sort((a, b) => b.value - a.value)
          .map((item, idx) => ({ ...item, rank: idx + 1 }));

        setRankingData(sortedData);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [metric, segment]);

  // Calcul des agrégats sectoriels et parts de marché globales
  const stats = useMemo(() => {
    const list = Array.isArray(rankingData) ? rankingData : [];
    if (list.length === 0) return { total: 0, average: 0, leader: "Aucun" };
    
    const total = list.reduce((sum, item) => sum + item.value, 0);
    const average = total / list.length;
    const leader = list[0]?.company || "Aucun";
    
    return { total, average, leader };
  }, [rankingData]);

  // Formatteur d'affichage intelligent selon l'unité de l'indicateur sélectionné
  const formatNumber = (num: number) => {
    if (metric === "ratio_sp" || metric === "taux_effectif_impot") {
      return `${num.toFixed(2)} %`;
    }
    if (Math.abs(num) >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)} M TND`;
    }
    return new Intl.NumberFormat("fr-TN", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(num);
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1: return <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white font-bold shadow-sm"><Trophy className="w-3 h-3 mr-1" /> 1er</Badge>;
      case 2: return <Badge className="bg-slate-400 text-white font-bold shadow-sm">2e</Badge>;
      case 3: return <Badge className="bg-amber-700 text-white font-bold shadow-sm">3e</Badge>;
      default: return <Badge variant="outline" className="font-medium text-slate-500 bg-background">{rank}e</Badge>;
    }
  };

  const validData = Array.isArray(rankingData) ? rankingData : [];
  const maxValue = validData.length > 0 ? Math.max(...validData.map(d => d.value)) : 1;
  
  // Graphique de Parts de marché circulaire
  const marketSharePieData = useMemo(() => {
    if (metric === "ratio_sp" || metric === "taux_effectif_impot") return [];
    return validData.map(item => ({
      name: item.company,
      value: item.value > 0 ? Math.round(item.value) : 0
    }));
  }, [validData, metric]);

  const CHART_COLORS = ["#0284c7", "#10b981", "#6366f1", "#8b5cf6", "#f59e0b", "#94a3b8"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* SECTION EN-TÊTE ET FILTRE DE BRANCHES AMÉLIORÉ */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300">
            <BarChart3 className="text-sky-600 w-7 h-7" /> Benchmark & Segmentation Sectorielle
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Classement et parts de marché des compagnies d&apos;assurance tunisiennes par branche technique.
          </p>
        </div>
        
        {/* Filtre Supérieur des 4 Branches Métiers */}
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
              <TabsTrigger value="risques_divers" className="data-[state=active]:bg-background data-[state=active]:shadow-sm text-xs gap-1">
                <SidebarIcon className="w-3.5 h-3.5 text-indigo-500" /> R. Divers
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* GRILLE DES 5 CRITÈRES DE TRI SÉMANTIQUES */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card 
          className={`cursor-pointer border border-border/50 shadow-sm transition-all ${metric === 'primes_emises' ? 'ring-2 ring-sky-600 bg-sky-50/20 dark:bg-sky-950/10' : 'hover:bg-muted/40'}`}
          onClick={() => setMetric("primes_emises")}
        >
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Primes Émises</CardTitle>
            <DollarSign className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-extrabold font-mono tracking-tight text-foreground">Chiffre d&apos;Affaires</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer border border-border/50 shadow-sm transition-all ${metric === 'resultat_technique' ? 'ring-2 ring-sky-600 bg-sky-50/20 dark:bg-sky-950/10' : 'hover:bg-muted/40'}`}
          onClick={() => setMetric("resultat_technique")}
        >
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rés. Technique</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-extrabold font-mono tracking-tight text-foreground">Marge Pure</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer border border-border/50 shadow-sm transition-all ${metric === 'resultat_net' ? 'ring-2 ring-sky-600 bg-sky-50/20 dark:bg-sky-950/10' : 'hover:bg-muted/40'}`}
          onClick={() => setMetric("resultat_net")}
        >
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Résultat Net</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-extrabold font-mono tracking-tight text-foreground">Bénéfice Final</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer border border-border/50 shadow-sm transition-all ${metric === 'ratio_sp' ? 'ring-2 ring-sky-600 bg-sky-50/20 dark:bg-sky-950/10' : 'hover:bg-muted/40'}`}
          onClick={() => setMetric("ratio_sp")}
        >
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ratio S/P</CardTitle>
            <Percent className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-extrabold font-mono tracking-tight text-foreground">Sinistralité</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer border border-border/50 shadow-sm transition-all ${metric === 'taux_effectif_impot' ? 'ring-2 ring-sky-600 bg-sky-50/20 dark:bg-sky-950/10' : 'hover:bg-muted/40'}`}
          onClick={() => setMetric("taux_effectif_impot")}
        >
          <CardHeader className="p-3 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Taux IS Effectif</CardTitle>
            <ShieldAlert className="h-4 w-4 text-rose-600" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <p className="text-lg font-extrabold font-mono tracking-tight text-foreground">Pression Fiscale</p>
          </CardContent>
        </Card>
      </div>

      {/* BLOCS DE SYNTHÈSE DES COMPTES AGREGÉS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-muted/30 border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 bg-sky-600 rounded-xl text-white shadow-sm"><Sigma className="w-5 h-5" /></div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Volume Global Branche</p>
              <p className="text-xl font-black font-mono text-foreground mt-0.5">{formatNumber(stats.total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30 border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 bg-emerald-500 rounded-xl text-white shadow-sm"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Moyenne Concurrentielle</p>
              <p className="text-xl font-black font-mono text-foreground mt-0.5">{formatNumber(stats.average)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30 border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 bg-amber-500 rounded-xl text-white shadow-sm"><Trophy className="w-5 h-5" /></div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Premier du Segment</p>
              <p className="text-xl font-black text-foreground mt-0.5 flex items-center gap-1 truncate max-w-[220px]">
                {stats.leader}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert className="border-amber-200 bg-amber-50/40">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-bold text-amber-900 text-xs">Alerte d&apos;Intégration Actuarielle</AlertTitle>
          <AlertDescription className="text-amber-800 text-xs mt-0.5">{error}</AlertDescription>
        </Alert>
      )}

      {/* ARCHITECTURE EN GRILLE ASYMÉTRIQUE VISUELLE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* GRAPHIQUE HISTOGRAMME COMPARATIF */}
        <Card className="lg:col-span-2 shadow-sm border-border/60 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <BarChart3 className="w-4 h-4 text-sky-600" /> Asymétrie et Distribution des Acteurs
            </CardTitle>
            <CardDescription className="text-xs">
              Positionnement relatif des parts de marché et ratios sur le segment sélectionné.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px] pb-4 flex items-center justify-center">
            {isLoading ? (
              <div className="text-center text-xs text-muted-foreground animate-pulse">Calcul de la distribution...</div>
            ) : validData.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground">Aucun graphique disponible.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={validData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="company" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tickFormatter={(v) => typeof v === 'number' && v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v} tick={{ fontSize: 10 }} />
                  <Tooltip 
                    formatter={(value: any) => [formatNumber(Number(value)), "Indicateur"]}
                    contentStyle={{ backgroundColor: "#0f172a", color: "#fff", borderRadius: "8px", fontSize: "12px" }}
                  />
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

        {/* NOUVEAU GRAPHIQUE DE PARTS DE MARCHÉ (DONUT) OU CONCENTRATION DU MAXIMUM */}
        <Card className="shadow-sm border-border/60 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <PieIcon className="w-4 h-4 text-sky-600" /> Concentration & Part de Marché
            </CardTitle>
            <CardDescription className="text-xs">
              Poids relatif ou écart par rapport au leader du marché.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center space-y-4">
            {isLoading ? (
              <div className="py-10 text-center text-xs text-muted-foreground animate-pulse">Génération des volumes...</div>
            ) : validData.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">Aucun graphique disponible.</div>
            ) : (
              // Rendu conditionnel : si indicateur en valeur absolue (Primes, résultats), Donut chart de part de marché, sinon barres de concentration
              marketSharePieData.length > 0 ? (
                <div className="h-[240px] w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={marketSharePieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {marketSharePieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatNumber(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="space-y-3">
                  {validData.map((item, idx) => {
                    const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                    return (
                      <div key={item.file_id || idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span>{item.company}</span>
                          <span className="text-muted-foreground font-mono">{percentage.toFixed(0)}% du max</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                          <div 
                            className="bg-sky-600 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(percentage, 2)}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </CardContent>
        </Card>

        {/* COMPOSANT LEADERBOARD PRINCIPAL ÉPURÉ */}
        <Card className="lg:col-span-3 shadow-sm border-border/60">
          <CardHeader className="bg-muted/10 pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> Registre du Leaderboard des Assurances
            </CardTitle>
            <CardDescription className="text-xs">
              Classement ordonné par ordre de performance décroissante selon les filtres sectoriels.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center text-xs text-muted-foreground animate-pulse">Chargement de la balance SQL...</div>
            ) : validData.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground">Aucune donnée disponible.</div>
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
                        {formatNumber(item.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Icône de secours inline pour pallier l'absence temporaire du composant Lucide correspondant
function SidebarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}