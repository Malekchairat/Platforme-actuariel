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
  const isPositive = (kpi.change ?? 0) >= 0;

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
              isPositive ? "text-emerald-600" : "text-red-600",
            )}
          >
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            <span>
              {isPositive ? "+" : ""}
              {kpi.change}% {kpi.changeLabel}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
