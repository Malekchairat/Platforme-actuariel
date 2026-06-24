"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { ExpandableSections } from "@/components/tables/expandable-sections";
import { getFinancialData, getFinancialTableRows } from "@/lib/mock-api";
import { useAppStore } from "@/lib/store";
import type { FinancialData, TableRow } from "@/lib/types";

export function FinancialStatementsView() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [financial, setFinancial] = useState<FinancialData | null>(null);

  const load = useCallback(async (companyId: string) => {
    setLoading(true);
    const [tableRows, data] = await Promise.all([
      getFinancialTableRows(companyId),
      getFinancialData(companyId),
    ]);
    setRows(tableRows);
    setFinancial(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(selectedCompanyId);
  }, [selectedCompanyId, load]);

  return (
    <>
      <AppHeader
        title="États financiers"
        description="Données extraites des états financiers"
      />

      <div className="space-y-6 p-8">
        {loading || !financial ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Chargement...
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{financial.company}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Données JSON — {selectedCompanyId}
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
              <ExpandableSections rows={rows} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
