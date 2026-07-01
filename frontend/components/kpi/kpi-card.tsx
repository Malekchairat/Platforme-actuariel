import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/financial-transformers";
import type { KPI } from "@/lib/types";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  kpi: KPI;
}

function formatValue(kpi: KPI): string {
  if (kpi.format === "percent") return formatPercent(kpi.value);
  if (kpi.format === "currency" || !kpi.format) return formatCurrency(kpi.value);
  return kpi.value.toLocaleString("fr-TN");
}

export function KpiCard({ kpi }: KpiCardProps) {
  const changeValue = kpi.change ?? 0;
  const isChangePositive = changeValue >= 0;

  // Détection des KPIs de type "charges" ou "coûts"
  const labelLower = kpi.label.toLowerCase();
  const isExpense = 
    labelLower.includes("sinistre") || 
    labelLower.includes("charge") || 
    labelLower.includes("frais") || 
    labelLower.includes("impôt") ||
    labelLower.includes("cession");

  // Logique de couleur inversée si c'est une charge
  // Hausse de charge = Rouge | Baisse de charge = Vert
  const isGoodTrend = isExpense ? !isChangePositive : isChangePositive;

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {kpi.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{formatValue(kpi)}</p>
        {kpi.change !== undefined && (
          <div
            className={cn(
              "mt-2 flex items-center gap-1 text-xs font-medium",
              isGoodTrend ? "text-emerald-600" : "text-red-600",
            )}
          >
            {isChangePositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span>
              {isChangePositive ? "+" : ""}
              {kpi.change}% {kpi.changeLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}