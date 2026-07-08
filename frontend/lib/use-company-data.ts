"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore } from "@/lib/store";

interface UseCompanyDataOptions<T> {
  loader: (companyId: string) => Promise<T>;
}

export function useCompanyData<T>({ loader }: UseCompanyDataOptions<T>) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 🛠️ FIX INIFINITE LOOP : On fige la référence de la fonction loader dans un Ref
  // pour éviter que le useEffect de chargement ne s'exécute à chaque re-render.
  const stableLoader = useRef(loader);

  useEffect(() => {
    stableLoader.current = loader;
  }, [loader]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedCompanyId) return;

      setLoading(true);
      setError(null);
      try {
        // Exécution sécurisée de la fonction via sa valeur de référence persistée
        const result = await stableLoader.current(selectedCompanyId);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur de chargement");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]); // 🛠️ "loader" est retiré d'ici : la boucle de rendu est détruite.

  return { data, loading, error, selectedCompanyId };
}