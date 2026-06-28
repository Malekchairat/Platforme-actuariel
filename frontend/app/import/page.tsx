"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { DataImportPanel } from "@/components/import/data-import-panel";
import { clearDataCache, getCompanies } from "@/lib/mock-api";
import { useAppStore } from "@/lib/store";

export default function ImportPage() {
  const router = useRouter();
  const setCompanies = useAppStore((s) => s.setCompanies);

  const refreshGlobalStore = async () => {
    clearDataCache();
    const companies = await getCompanies();
    setCompanies(companies);
  };

  return (
    <>
      <AppHeader
        title="Import de données"
        description="Analyse RAG du document puis extraction automatique des indicateurs financiers"
        showImport={false}
      />

      <div className="mx-auto max-w-3xl space-y-6 p-8">
        <DataImportPanel
          // IMPORTATION : Redirige vers le dashboard après succès
          onImportSuccess={async () => {
            await refreshGlobalStore();
            router.push("/dashboard");
          }}
          // SUPPRESSION : Reste sur la page et met à jour uniquement l'état global
          onDeleteSuccess={async () => {
            await refreshGlobalStore();
          }}
        />

        <div className="rounded-xl border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-sm">
          <h3 className="mb-2 font-medium text-foreground">Comment ça fonctionne</h3>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Le document est analysé par un classifieur RAG (Gemini + contexte actuariel).</li>
            <li>Si le contenu n&apos;est pas lié à l&apos;assurance, l&apos;import est refusé.</li>
            <li>Sinon, le pipeline d&apos;extraction extrait primes, sinistres, bilan, etc.</li>
            <li>Le JSON est enregistré dans <code>data/processed/</code> et disponible dans le dashboard.</li>
          </ol>
        </div>
      </div>
    </>
  );
}