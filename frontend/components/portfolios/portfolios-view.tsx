"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Layers } from "lucide-react";
import { MiniTrendChart } from "@/components/charts/mini-trend-chart";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent, buildPortfolios } from "@/lib/financial-transformers";
import { useCompanyData } from "@/lib/use-company-data";
import type { Portfolio } from "@/lib/types";

function riskBadge(level: Portfolio["riskLevel"]) {
  const variants = {
    low: "default",
    medium: "secondary",
    high: "destructive",
  } as const;

  const labels = {
    low: "Faible",
    medium: "Moyen",
    high: "Élevé",
  };

  return <Badge variant={variants[level]}>{labels[level]}</Badge>;
}

export function PortfoliosView() {
  // Consommation sécurisée de l'API REST locale synchrone
  const { data, loading, error, selectedCompanyId } = useCompanyData<any>({
    loader: async (companyId: string) => {
      if (!companyId) return null;
      const res = await fetch(`http://localhost:8055/financial/processed/${companyId}`);
      if (!res.ok) {
        throw new Error(`Impossible d'extraire la balance comptable de : ${companyId}`);
      }
      return res.json();
    },
  });

  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  useEffect(() => {
    if (!loading && data) {
      // Extraction dynamique des comptes de sous-branches
      const realPortfolios = buildPortfolios(data);
      setPortfolios(realPortfolios);
    }
  }, [data, loading]);

  const companyNameClean = (selectedCompanyId || "Compagnie").replace(/_2025/g, "").toUpperCase();

  return (
    <>
      <AppHeader
        title={`Portefeuilles Réels — ${companyNameClean}`}
        description="Analyse sectorielle dynamique de la sinistralité calculée d'après l'Annexe 12."
      />

      <div className="space-y-6 p-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
            Synchronisation avec les registres de branches PostgreSQL...
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="font-bold">Erreur de traitement</AlertTitle>
            <AlertDescription className="text-xs">
              Échec de lecture des comptes techniques de {companyNameClean}. Métadonnées : {error}
            </AlertDescription>
          </Alert>
        ) : portfolios.length === 0 ? (
          <Alert className="border-blue-200 bg-blue-50/40">
            <Layers className="h-4 w-4 text-blue-600" />
            <AlertTitle className="font-bold text-blue-950 text-sm">Segmentation indisponible</AlertTitle>
            <AlertDescription className="text-xs text-blue-900 mt-1">
              Aucun sous-portefeuille sectoriel n&apos;est enregistré pour cette entité d&apos;assurance.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Grille de cartes dynamiques par ligne de risques */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {portfolios.map((portfolio) => (
                <Card key={portfolio.id} className="border-border/60 shadow-sm hover:border-primary/40 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {portfolio.name}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground capitalize font-medium">
                        Branche : {portfolio.branch}
                      </p>
                    </div>
                    {riskBadge(portfolio.riskLevel)}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold">Rentabilité Pure Segment</p>
                        <p className={`text-lg font-black font-mono tracking-tight ${portfolio.profitability >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatPercent(portfolio.profitability)}
                        </p>
                      </div>
                      {portfolio.trend && portfolio.trend.length > 0 && (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase">Axe Évolution</p>
                          <span className="text-xs font-mono font-bold text-sky-600">N-1 ➔ N</span>
                        </div>
                      )}
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm border-t border-muted pt-3">
                      <div>
                        <dt className="text-muted-foreground text-xs">Primes Émises Brutes</dt>
                        <dd className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatCurrency(portfolio.primes)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-xs">Charges de Sinistres</dt>
                        <dd className="font-bold font-mono text-slate-800 dark:text-slate-200">{formatCurrency(portfolio.sinistres)}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tableau Consolidé Général */}
            <Card className="border-border/60 shadow-sm overflow-hidden">
              <CardHeader className="bg-muted/30 border-b border-border/40 py-3">
                <CardTitle className="text-sm font-semibold">Vue Consolidée des Branches Techniques</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow>
                      <TableHead className="pl-6 text-xs font-bold uppercase tracking-wider">Ligne de Produit</TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider">Typologie</TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Primes Émises Brutes</TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Charges de Sinistres</TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Marge Technique</TableHead>
                      <TableHead className="text-right text-xs font-bold uppercase tracking-wider">Ratio Rentabilité</TableHead>
                      <TableHead className="pr-6 text-xs font-bold uppercase tracking-wider">Indicateur Alerte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolios.map((p) => (
                      <TableRow key={p.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="font-bold pl-6 text-slate-900 dark:text-slate-100">{p.name}</TableCell>
                        <TableCell className="capitalize font-medium text-muted-foreground text-xs">{p.branch}</TableCell>
                        <TableCell className="text-right font-bold font-mono text-slate-800 dark:text-slate-200">
                          {formatCurrency(p.primes)}
                        </TableCell>
                        <TableCell className="text-right font-bold font-mono text-slate-800 dark:text-slate-200">
                          {formatCurrency(p.sinistres)}
                        </TableCell>
                        <TableCell className={`text-right font-black font-mono ${p.resultat >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatCurrency(p.resultat)}
                        </TableCell>
                        <TableCell className={`text-right font-black font-mono ${p.profitability >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {formatPercent(p.profitability)}
                        </TableCell>
                        <TableCell className="pr-6">{riskBadge(p.riskLevel)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}