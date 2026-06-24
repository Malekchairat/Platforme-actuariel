import type { KPI } from "@/lib/types";
import { KpiCard } from "./kpi-card";

export function KpiGrid({ kpis }: { kpis: KPI[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  );
}
