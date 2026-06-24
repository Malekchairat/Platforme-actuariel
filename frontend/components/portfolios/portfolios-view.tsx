"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { MiniTrendChart } from "@/components/charts/mini-trend-chart";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/financial-transformers";
import { getPortfolios } from "@/lib/mock-api";
import { useAppStore } from "@/lib/store";
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
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [loading, setLoading] = useState(true);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);

  const load = useCallback(async (companyId: string) => {
    setLoading(true);
    setPortfolios(await getPortfolios(companyId));
    setLoading(false);
  }, []);

  useEffect(() => {
    load(selectedCompanyId);
  }, [selectedCompanyId, load]);

  return (
    <>
      <AppHeader
        title="Portefeuilles"
        description="Analyse des segments d'assurance par branche"
      />

      <div className="space-y-6 p-8">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Chargement...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {portfolios.map((portfolio) => (
                <Card key={portfolio.id} className="border-border/60 shadow-sm">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base font-semibold">{portfolio.name}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground capitalize">
                        {portfolio.branch}
                      </p>
                    </div>
                    {riskBadge(portfolio.riskLevel)}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Rentabilité</p>
                        <p className="text-lg font-semibold">
                          {formatPercent(portfolio.profitability)}
                        </p>
                      </div>
                      <MiniTrendChart
                        data={portfolio.trend}
                        color={
                          portfolio.branch === "non-vie" ? "var(--chart-1)" : "var(--chart-2)"
                        }
                      />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Primes</dt>
                        <dd className="font-medium">{formatCurrency(portfolio.primes)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Sinistres</dt>
                        <dd className="font-medium">{formatCurrency(portfolio.sinistres)}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Vue consolidée</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Portefeuille</TableHead>
                      <TableHead>Branche</TableHead>
                      <TableHead className="text-right">Primes</TableHead>
                      <TableHead className="text-right">Sinistres</TableHead>
                      <TableHead className="text-right">Résultat</TableHead>
                      <TableHead className="text-right">Rentabilité</TableHead>
                      <TableHead>Risque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolios.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="capitalize">{p.branch}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(p.primes)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(p.sinistres)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(p.resultat)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(p.profitability)}
                        </TableCell>
                        <TableCell>{riskBadge(p.riskLevel)}</TableCell>
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
