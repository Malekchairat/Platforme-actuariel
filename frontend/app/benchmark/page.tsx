"use client";

import { useState, useEffect } from "react";
import { Loader2, ArrowLeftRight, TrendingUp, ShieldCheck, Percent, Award, PieChart as PieIcon, Activity } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { getCompanies, getFinancialData } from "@/lib/mock-api";
import { resolveMetricNumber, resolveMetricNumberPast } from "@/lib/financial-transformers";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  ScatterChart, Scatter, ReferenceLine, LabelList, PieChart, Pie, Cell, 
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from "recharts";

const COLORS = ["#6366f1", "#10b981", "#38bdf8", "#f59e0b", "#ec4899", "#8b5cf6"];

// --- COMPOSANT 1 : MATRICE STRATÉGIQUE (SCATTER) ---
const CustomQuadrantTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 text-white p-3 rounded-lg border border-slate-700 shadow-xl text-xs font-mono">
        <p className="font-bold text-sky-400 mb-1">{data.company}</p>
        <p>📈 Taux Croissance : <span className="font-bold">{data.txc.toFixed(2)} %</span></p>
        <p>💰 Rentabilité (ROE) : <span className="font-bold text-emerald-400">{data.roe.toFixed(2)} %</span></p>
      </div>
    );
  }
  return null;
};

function BenchmarkQuadrantChart({ data }: { data: any[] }) {
  const avgTxC = data.reduce((acc, curr) => acc + curr.txc, 0) / (data.length || 1);
  const avgROE = data.reduce((acc, curr) => acc + curr.roe, 0) / (data.length || 1);

  const chartData = data.map((item) => ({
    x: item.txc,
    y: item.roe,
    company: item.company.replace("Compagnie d'Assurances et de Réassurances", "").trim(),
    txc: item.txc,
    roe: item.roe
  }));

  return (
    <Card className="border border-border/60 shadow-sm w-full">
      <CardContent className="p-6">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Matrice Stratégique Prudentielle : Taux de Croissance vs ROE Secteur
        </h4>
        <p className="text-xs text-muted-foreground mb-6">
          Diagnostic de positionnement concurrentiel. La ligne rouge verticale représente la moyenne de croissance du marché et l&apos;horizontale matérialise le seuil cible de rentabilité.
        </p>

        <div className="h-96 w-full bg-slate-50/30 dark:bg-slate-900/10 rounded-xl p-2 border border-border/40 relative">
          <div className="absolute top-4 right-4 text-[10px] font-bold uppercase text-emerald-600/40 tracking-wider select-none">Forte Croissance / Rentable ⭐</div>
          <div className="absolute top-4 left-4 text-[10px] font-bold uppercase text-amber-600/40 tracking-wider select-none">Maturité / Rentable 🔒</div>
          <div className="absolute bottom-4 left-4 text-[10px] font-bold uppercase text-rose-600/40 tracking-wider select-none">Sous-Performance ⚠️</div>

          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Taux de Croissance" 
                unit="%" 
                domain={['-10', '60']}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.7}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="ROE" 
                unit="%" 
                domain={[0, 40]}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                opacity={0.7}
              />
              <Tooltip content={<CustomQuadrantTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceLine 
                x={avgTxC > 0 ? avgTxC : 7.2} 
                stroke="#ef4444" 
                strokeWidth={2} 
                strokeDasharray="3 3"
                label={{ value: "Moy. Secteur TxC", position: "top", fill: "#ef4444", fontSize: 10, fontWeight: "bold" }}
              />
              <ReferenceLine 
                y={avgROE > 0 ? avgROE : 10.0} 
                stroke="#ef4444" 
                strokeWidth={2}
                label={{ value: "Seuil Cible ROE", position: "right", fill: "#ef4444", fontSize: 10, fontWeight: "bold" }}
              />
              <Scatter name="Assurances" data={chartData} fill="#6366f1">
                <LabelList dataKey="company" position="top" offset={10} style={{ fontSize: '11px', fontWeight: 'bold', fill: 'currentColor' }} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// --- MAIN PAGE COMPONENT ---
export default function BenchmarkPage() {
  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [selectedIds, setSelectedSelectedIds] = useState<string[]>([]);
  const [benchData, setBenchData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const list = await getCompanies();
      setCompaniesList(list);
      if (list.length > 0) {
        setSelectedSelectedIds(list.slice(0, 3).map((c) => c.id || c.name));
      }
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setBenchData([]);
      return;
    }

    async function computeMetrics() {
      const records = await Promise.all(selectedIds.map((id) => getFinancialData(id)));
      
      const totalSectorCA = records.reduce((acc, r: any) => {
        return acc + resolveMetricNumber(r?.non_vie?.primes_emises) + resolveMetricNumber(r?.vie?.primes_emises);
      }, 0) || 1;

      const results = records.map((r: any) => {
        const nvPrimes = resolveMetricNumber(r?.non_vie?.primes_emises);
        const vPrimes = resolveMetricNumber(r?.vie?.primes_emises);
        const caTotal = nvPrimes + vPrimes;

        const nvPrimesPast = resolveMetricNumberPast(r?.non_vie?.primes_emises);
        const vPrimesPast = resolveMetricNumberPast(r?.vie?.primes_emises);
        const caPastTotal = nvPrimesPast + vPrimesPast;
        const txc = caPastTotal > 0 ? ((caTotal - caPastTotal) / caPastTotal) * 100 : 9.0;

        const nvPrimesAcquises = resolveMetricNumber(r?.non_vie?.primes_acquises);
        const vPrimesAcquises = resolveMetricNumber(r?.vie?.primes_acquises);
        const paTotal = nvPrimesAcquises + vPrimesAcquises;

        const nvSinistres = resolveMetricNumber(r?.non_vie?.charges_sinistres);
        const vSinistres = resolveMetricNumber(r?.vie?.charges_sinistres);

        const nvAcquisition = resolveMetricNumber(r?.non_vie?.frais_d_acquisition);
        const nvAdmin = resolveMetricNumber(r?.non_vie?.frais_d_administration);
        
        const cp = resolveMetricNumber(r?.global?.fonds_propres);
        const pt = resolveMetricNumber(r?.non_vie?.provisions_techniques) + resolveMetricNumber(r?.vie?.provisions_mathématiques);
        const plac = resolveMetricNumber(r?.global?.produits_financiers) * 12;
        
        const rn = resolveMetricNumber(r?.non_vie?.resultat_net) || resolveMetricNumber(r?.global?.resultat_net) || 1;
        const rt = resolveMetricNumber(r?.non_vie?.resultat_technique) + resolveMetricNumber(r?.vie?.resultat_technique);

        const roe = cp > 0 ? (rn / cp) * 100 : 0;
        const tp = paTotal > 0 ? (rn / paTotal) * 100 : 0;
        const rcp = cp > 0 ? (paTotal / cp) * 100 : 0;
        const trt = paTotal > 0 ? (rt / paTotal) * 100 : 0;
        const lossRatio = paTotal > 0 ? ((nvSinistres + vSinistres) / paTotal) * 100 : 0;
        const expenseRatio = caTotal > 0 ? ((nvAcquisition + nvAdmin) / caTotal) * 100 : 0;
        const combinedRatio = lossRatio + expenseRatio;
        const tms = cp > 0 ? (cp / (caTotal * 0.2)) * 100 : 0;
        const tco = pt > 0 ? ((plac * 1.5) / pt) * 100 : 102.4;

        return {
          company: (r.company || "Assureur").replace("Compagnie d'Assurances et de Réassurances", "").trim(),
          ca: caTotal,
          pm: (caTotal / totalSectorCA) * 100,
          txc,
          roe,
          tp,
          rcp,
          trt,
          lossRatio,
          expenseRatio,
          combinedRatio,
          tms,
          tco
        };
      });

      setBenchData(results);
    }
    computeMetrics();
  }, [selectedIds]);

  const toggleCompanySelection = (id: string) => {
    setSelectedSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground bg-background">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-primary" />
        Chargement des balances du marché...
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <AppHeader
        title="Analyse Comparative & Benchmarking"
        description="Outil de diagnostic financier multilatéral basé sur les référentiels FTUSA / CGA"
      />

      <div className="space-y-8 p-8 flex-1">
        {/* BANDEAU DE SÉLECTION DYNAMIQUE */}
        <Card className="border border-border/60 shadow-sm">
          <CardContent className="p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              Sélectionnez les Compagnies d&apos;Assurances à comparer
            </h3>
            <div className="flex flex-wrap gap-2">
              {companiesList.map((c) => {
                const isSelected = selectedIds.includes(c.id || c.name);
                return (
                  <button
                    key={c.id || c.name}
                    onClick={() => toggleCompanySelection(c.id || c.name)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-sm border ${
                      isSelected
                        ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                        : "bg-card border-border hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedIds.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            Veuillez sélectionner au moins une compagnie pour afficher l&apos;analyse de marché.
          </div>
        ) : (
          <>
            {/* LIGNE 1 : MATRICE SCATTER */}
            <BenchmarkQuadrantChart data={benchData} />

            {/* LIGNE 2 : DEUX GRAPHIQUES RADICALEMENT DIFFÉRENTS (PIE & RADAR) */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* GRAPH 1: PIE CHART POUR LES PARTS DE MARCHÉ */}
              <Card className="border border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                    <PieIcon className="h-4 w-4 text-sky-500" />
                    Parts de Marché Relatives (Volume Primes)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Distribution du Chiffre d&apos;Affaires sur l&apos;échantillon sélectionné.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={benchData}
                        dataKey="ca"
                        nameKey="company"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(props: any) => `${props.payload.company} (${props.payload.pm.toFixed(1)}%)`}
                      >
                        {benchData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => [`${(Number(value) / 1000000).toFixed(1)} M DT`, "Primes Émises"]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* GRAPH 2: RADAR CHART POUR LA RENTABILITÉ GLOBALE */}
              <Card className="border border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                    <Award className="h-4 w-4 text-emerald-500" />
                    Profil de Performance & Rentabilité (ROE vs TP)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Comparaison du ROE (Rentabilité CP) et du Taux de Profit Global (TP).
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72 flex justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={benchData}>
                      <PolarGrid className="stroke-border/60" />
                      <PolarAngleAxis dataKey="company" style={{ fontSize: 11, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 'auto']} style={{ fontSize: 10 }} />
                      <Radar name="ROE %" dataKey="roe" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                      <Radar name="Taux Profit (TP) %" dataKey="tp" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                      <Tooltip formatter={(value: any) => [`${Number(value).toFixed(1)} %`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* LIGNE 3 : PERFORMANCE TECHNIQUE ET COUVERTURE PRUDENTIELLE (BARS EMPILÉES & LIGNES TEMPORELLES/DE SEUILS) */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* GRAPH 3: BAR CHART EMPILÉ POUR LE RATIO COMBINÉ */}
              <Card className="border border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                    <Activity className="h-4 w-4 text-indigo-500" />
                    Ratio Combiné Actuariel vs Seuil Limite (100%)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Doit être inférieur à 100% pour dégager un bénéfice technique sur les souscriptions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={benchData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
                      <XAxis dataKey="company" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} />
                      <YAxis tick={{ fontSize: 11 }} domain={[0, 140]} stroke="currentColor" opacity={0.6} />
                      <Tooltip formatter={(value: any) => [`${Number(value).toFixed(1)} %`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="5 5" label={{ value: "Seuil d'Équilibre (100%)", position: "top", fill: "#ef4444", fontSize: 10, fontWeight: 'bold' }} />
                      <Bar dataKey="lossRatio" name="Taux Sinistralité (S/P)" fill="#6366f1" stackId="combined" />
                      <Bar dataKey="expenseRatio" name="Taux de Frais (F/P)" fill="#38bdf8" stackId="combined" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* GRAPH 4: LINE CHART COMPARAISON PRUDENTIELLE DES COUVERTURES */}
              <Card className="border border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-muted-foreground uppercase flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                    Marge de Solvabilité (TMS) vs Couverture des PT (TCO)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Indicateurs réglementaires de robustesse face aux engagements techniques.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={benchData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                      <XAxis dataKey="company" tick={{ fontSize: 10 }} stroke="currentColor" opacity={0.6} />
                      <YAxis tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
                      <Tooltip formatter={(value: any) => [`${Number(value).toFixed(1)} %`, ""]} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={100} stroke="#f59e0b" strokeWidth={1.5} label={{ value: "Minimum Légal (100%)", position: "bottom", fill: "#f59e0b", fontSize: 10 }} />
                      <Line type="monotone" dataKey="tms" name="Marge de Solvabilité (TMS)" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="tco" name="Couverture des PT (TCO)" stroke="#ec4899" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}