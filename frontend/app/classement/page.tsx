"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, ArrowUpRight, TrendingUp, DollarSign, Percent, BarChart3, AlertCircle, Sigma, Building2, PieChart } from "lucide-react";
import { fetchMarketRanking, RankingItem } from "@/lib/api-client"; 
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function ClassementPage() {
  const [metric, setMetric] = useState<string>("primes_emises");
  const [segment, setSegment] = useState<string>("non_vie");
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
          throw new Error("L'API n'a pas renvoyé un tableau.");
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("Mode fallback activé suite à l'absence de données réelles :", err.message);
        setError("Affichage des données de simulation locales. Connectez et démarrez le backend pour synchroniser en direct.");
        
        const mockData: RankingItem[] = [
          { company: "MAGHREBIA", value: metric === "primes_emises" ? 293448347 : metric === "resultat_net" ? 43432196 : 17210192, file_id: "MAGHREBIA_2025", rank: 1 },
          { company: "BIAT ASSURANCE", value: metric === "primes_emises" ? 208346299 : metric === "resultat_net" ? 12202000 : 6328000, file_id: "BIAT_2025", rank: 2 },
          { company: "ATIJARI ASSURANCES", value: metric === "primes_emises" ? 169002179 : metric === "resultat_net" ? 12805091 : 7386930, file_id: "ATIJARI_2025", rank: 3 },
          { company: "BNA ASSURANCES", value: metric === "primes_emises" ? 146264097 : metric === "resultat_net" ? 7045881 : 4733860, file_id: "BNA_2025", rank: 4 },
          { company: "ASTREE", value: metric === "primes_emises" ? 90937720 : metric === "resultat_net" ? 5430000 : 3742535, file_id: "ASTREE_2025", rank: 5 },
          { company: "TAKAFULIA", value: metric === "primes_emises" ? 45653060 : metric === "resultat_net" ? 1596242 : 713503, file_id: "TAKAFULIA_2025", rank: 6 },
        ]
          .sort((a, b) => b.value - a.value)
          .map((item, idx) => ({ ...item, rank: idx + 1 }));

        setRankingData(mockData);
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

  const stats = useMemo(() => {
    const list = Array.isArray(rankingData) ? rankingData : [];
    if (list.length === 0) return { total: 0, average: 0, leader: "Aucun" };
    
    const total = list.reduce((sum, item) => sum + item.value, 0);
    const average = total / list.length;
    const leader = list[0]?.company || "Aucun";
    
    return { total, average, leader };
  }, [rankingData]);

  const formatNumber = (num: number) => {
    if (metric === "taux_effectif_impot") return `${num} %`;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)} M TND`;
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "TND", maximumFractionDigits: 0 }).format(num);
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1: return <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white font-bold"><Trophy className="w-3 h-3 mr-1" /> 1er</Badge>;
      case 2: return <Badge className="bg-slate-400 text-white font-bold">2e</Badge>;
      case 3: return <Badge className="bg-amber-700 text-white font-bold">3e</Badge>;
      default: return <Badge variant="outline" className="font-medium text-slate-600">{rank}e</Badge>;
    }
  };

  const validData = Array.isArray(rankingData) ? rankingData : [];
  const maxValue = validData.length > 0 ? Math.max(...validData.map(d => d.value)) : 1;
  const colors = ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#cbd5e1", "#e2e8f0"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 border-b pb-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            <BarChart3 className="text-primary w-8 h-8" /> Benchmark & Classement Marché
          </h1>
          <p className="text-muted-foreground mt-1">Analyse comparative transversale des compagnies d'assurance d'après les rapports financiers RAG.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm font-medium text-muted-foreground">Segment d'activité :</span>
          <Tabs value={segment} onValueChange={setSegment} className="w-[280px]">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="non_vie">Non-Vie</TabsTrigger>
              <TabsTrigger value="vie">Vie / Takaful</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card 
          className={`cursor-pointer transition-all ${metric === 'primes_emises' ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
          onClick={() => setMetric("primes_emises")}
        >
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Primes Émises (CA)</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Volume d'affaires sectoriel</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${metric === 'resultat_technique' ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
          onClick={() => setMetric("resultat_technique")}
        >
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Résultat Technique</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Performance de l'activité</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${metric === 'resultat_net' ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
          onClick={() => setMetric("resultat_net")}
        >
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Résultat Net</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Bénéfice comptable final</p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all ${metric === 'placements_nets' ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
          onClick={() => setMetric("placements_nets")}
        >
          <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-semibold">Placements Nets</CardTitle>
            <Percent className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Rendements des capitaux</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-50 border-none shadow-inner">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-500 rounded-xl text-white shadow-sm"><Sigma className="w-5 h-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Masse Globale Sectorielle</p>
              <p className="text-xl font-black text-slate-900">{formatNumber(stats.total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-none shadow-inner">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-500 rounded-xl text-white shadow-sm"><TrendingUp className="w-5 h-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Moyenne Marché</p>
              <p className="text-xl font-black text-slate-900">{formatNumber(stats.average)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-none shadow-inner">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-500 rounded-xl text-white shadow-sm"><Building2 className="w-5 h-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Leader Actuel</p>
              <p className="text-xl font-black text-slate-900 flex items-center gap-1">
                <Trophy className="w-4 h-4 text-amber-500 shrink-0" /> {stats.leader}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Alert className="border-amber-200 bg-amber-50/50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="font-bold text-amber-900">Note d'intégration</AlertTitle>
          <AlertDescription className="text-amber-800 text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 shadow-sm border-slate-200 flex flex-col">
          <CardHeader>
            <CardTitle className="text-md font-bold flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" /> Distribution & Positionnement Relatif
            </CardTitle>
            <CardDescription>Vue d'ensemble de l'asymétrie concurrentielle du marché.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[320px] pb-4 flex items-center justify-center">
            {isLoading ? (
              <div className="text-center text-muted-foreground animate-pulse">Calcul des volumes graphiques...</div>
            ) : validData.length === 0 ? (
              <div className="text-center text-muted-foreground">Aucun graphique disponible.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={validData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="company" tick={{ fontSize: 11, fontWeight: 600 }} />
                  <YAxis tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v} tick={{ fontSize: 11 }} />
                  <Tooltip 
                    formatter={(value: any) => [formatNumber(Number(value)), "Montant"]}
                    contentStyle={{ backgroundColor: "#0f172a", color: "#fff", borderRadius: "8px" }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {validData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Concentration du Marché</CardTitle>
            <CardDescription>Écart en % par rapport à la plus grosse capitalisation constatée.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground animate-pulse">Génération du graphique...</div>
            ) : validData.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Aucun graphique disponible.</div>
            ) : (
              validData.map((item, idx) => {
                const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                return (
                  <div key={item.file_id || idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span>{item.company}</span>
                      <span className="text-muted-foreground">{percentage.toFixed(0)}% du max</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-primary h-3 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold">Leaderboard des Assurances</CardTitle>
            <CardDescription>Liste ordonnée par ordre décroissant d'importance.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground animate-pulse">Chargement du classement...</div>
            ) : validData.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Aucune donnée disponible.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Rang</TableHead>
                    <TableHead>Compagnie</TableHead>
                    <TableHead className="text-right">Montant / Valeur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validData.map((item, idx) => (
                    <TableRow key={item.file_id || idx} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="py-3 font-semibold">{getRankBadge(item.rank)}</TableCell>
                      <TableCell className="py-3 font-medium">{item.company}</TableCell>
                      <TableCell className="py-3 text-right font-bold">{formatNumber(item.value)}</TableCell>
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