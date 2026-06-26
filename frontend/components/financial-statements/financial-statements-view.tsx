"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, HelpCircle } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { getFinancialData } from "@/lib/mock-api";
import { useAppStore } from "@/lib/store";

export function FinancialStatementsView() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [loading, setLoading] = useState(true);
  const [financial, setFinancial] = useState<any | null>(null);

  const load = useCallback(async (companyId: string) => {
    setLoading(true);
    // Récupération directe du dictionnaire JSON brut traité par le backend
    const data = await getFinancialData(companyId);
    setFinancial(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(selectedCompanyId);
  }, [selectedCompanyId, load]);

  const renderSectionRows = (sectionData: any) => {
    if (!sectionData) return null;

    return Object.entries(sectionData).map(([key, metric]: [string, any]) => {
      if (!metric || typeof metric !== "object") return null;

      const formatValue = (val: any) => {
        if (val === null || val === undefined) return "-";
        return Number(val).toLocaleString("fr-TN", { maximumFractionDigits: 0 }) + " TND";
      };

      const label = key.replace(/_/g, " ");
      const trend = metric.pct_change !== null ? `${metric.pct_change > 0 ? "+" : ""}${metric.pct_change}%` : "-";

      return (
        <tr key={key} className="border-b border-border/40 hover:bg-muted/30 transition-colors group relative">
          {/* Libellé du poste avec boîte d'audit interactive au survol */}
          <td className="py-3 px-4 font-medium text-sm flex items-center gap-1 capitalize">
            {label}
            <HelpCircle className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 cursor-help text-muted-foreground transition-opacity" />
            
            {/* Info-bulle de justification */}
            <div className="absolute left-4 top-full mt-1 hidden group-hover:block z-50 w-80 p-3 bg-slate-900 text-white rounded-lg text-xs shadow-xl border border-slate-700 font-sans normal-case tracking-normal">
              <p className="font-semibold mb-1 text-sky-400">Piste d&apos;audit Actuarielle :</p>
              <p className="mb-1">📍 <strong>Page Exercice N :</strong> Page {metric.page_n ?? "N/A"}</p>
              <p className="text-slate-400 font-mono bg-slate-950 p-1 rounded mb-2 overflow-x-auto max-w-full">&quot;{metric.snippet_n ?? "N/A"}&quot;</p>
              <p className="mb-1">📍 <strong>Page Exercice N-1 :</strong> Page {metric.page_n_1 ?? "N/A"}</p>
              <p className="text-slate-400 font-mono bg-slate-950 p-1 rounded overflow-x-auto max-w-full">&quot;{metric.snippet_n_1 ?? "N/A"}&quot;</p>
            </div>
          </td>
          <td className="py-3 px-4 text-right text-sm font-mono">{formatValue(metric.val_n)}</td>
          <td className="py-3 px-4 text-right text-sm font-mono text-muted-foreground">{formatValue(metric.val_n_1)}</td>
          <td className={`py-3 px-4 text-right text-sm font-bold font-mono ${metric.pct_change > 0 ? "text-emerald-600" : metric.pct_change < 0 ? "text-red-600" : ""}`}>{trend}</td>
        </tr>
      );
    });
  };

  return (
    <>
      <AppHeader
        title="Balance des États Financiers"
        description="Registre complet des données réglementaires extraites du rapport annuel"
      />

      <div className="space-y-8 p-8">
        {loading || !financial ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Lecture des balances comptables...
          </div>
        ) : (
          <>
            {/* En-tête de la compagnie d'assurance */}
            <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">{financial.company}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Piste d&apos;audit numérique officielle — Document ID: {selectedCompanyId}</p>
            </div>

            {/* Traitement des 3 blocs de données distincts */}
            {["non_vie", "vie", "global"].map((section) => (
              <div key={section} className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-md">
                <div className="bg-muted/50 px-6 py-4 border-b border-border/60">
                  <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    {section === "global" ? "Indicateurs Généraux Bilan & Capitaux" : `Comptes Techniques — Branche ${section.replace("_", " ")}`}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/20 border-b border-border/60 text-xs font-semibold text-muted-foreground uppercase">
                        <th className="py-3 px-4 w-1/3">Poste Comptable</th>
                        <th className="py-3 px-4 text-right w-1/4">Exercice N</th>
                        <th className="py-3 px-4 text-right w-1/4">Exercice N-1</th>
                        <th className="py-3 px-4 text-right w-1/6">Variation (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {renderSectionRows(financial[section])}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}