import {
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Percent,
  BarChart2,
  Activity,
} from "lucide-react";
import { formatCurrency, formatPercent } from "@/lib/financial-transformers";
import type { KPI } from "@/lib/types";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  kpi: KPI;
  index?: number;
}

function formatValue(kpi: KPI): string {
  if (kpi.format === "percent") return formatPercent(kpi.value);
  if (kpi.format === "currency" || !kpi.format) return formatCurrency(kpi.value);
  return kpi.value.toLocaleString("fr-TN");
}

/* Each card gets a distinct accent color cycling through the brand palette */
const ACCENTS = [
  { border: "#2E5C8A", icon: "#2E5C8A", bg: "rgba(46,92,138,0.08)", Icon: DollarSign },
  { border: "#1E9E63", icon: "#1E9E63", bg: "rgba(30,158,99,0.08)",  Icon: TrendingUp },
  { border: "#0B1F3A", icon: "#0B1F3A", bg: "rgba(11,31,58,0.06)",   Icon: BarChart2 },
  { border: "#F2A93B", icon: "#F2A93B", bg: "rgba(242,169,59,0.08)", Icon: Activity },
  { border: "#4A7FA8", icon: "#4A7FA8", bg: "rgba(74,127,168,0.08)", Icon: Percent },
];

export function KpiCard({ kpi, index = 0 }: KpiCardProps) {
  const accent = ACCENTS[index % ACCENTS.length];
  const AccentIcon = accent.Icon;

  const changeValue = kpi.change ?? 0;
  const isChangePositive = changeValue >= 0;

  const labelLower = kpi.label.toLowerCase();
  const isExpense =
    labelLower.includes("sinistre") ||
    labelLower.includes("charge") ||
    labelLower.includes("frais") ||
    labelLower.includes("impôt") ||
    labelLower.includes("cession");

  const isGoodTrend = isExpense ? !isChangePositive : isChangePositive;

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl bg-card p-5 overflow-hidden",
        "border border-border/70 shadow-sm",
        "hover:shadow-lg transition-all duration-200",
      )}
      style={{ borderLeftColor: accent.border, borderLeftWidth: "3px" }}
    >
      {/* Subtle background tint in top-right corner */}
      <div
        className="absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-60 transition-opacity group-hover:opacity-100"
        style={{ background: accent.bg }}
      />

      {/* Header row: label + icon */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight pr-2">
          {kpi.label}
        </p>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: accent.bg }}
        >
          <AccentIcon className="h-4 w-4" style={{ color: accent.icon }} />
        </div>
      </div>

      {/* Value */}
      <p
        className="mt-3 text-2xl font-extrabold tracking-tight leading-none"
        style={{ fontFamily: "var(--font-dm-mono), monospace", color: "var(--foreground)" }}
      >
        {formatValue(kpi)}
      </p>

      {/* Change badge */}
      {kpi.change !== undefined && (
        <div
          className={cn(
            "mt-3 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            isGoodTrend
              ? "bg-[#1E9E63]/10 text-[#1E9E63]"
              : "bg-[#E4032E]/10 text-[#E4032E]",
          )}
        >
          {isGoodTrend ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>
            {isChangePositive ? "+" : ""}
            {kpi.change}%{kpi.changeLabel ? ` ${kpi.changeLabel}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
