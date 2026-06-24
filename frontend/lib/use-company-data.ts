"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";

interface UseCompanyDataOptions<T> {
  loader: (companyId: string) => Promise<T>;
}

export function useCompanyData<T>({ loader }: UseCompanyDataOptions<T>) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await loader(selectedCompanyId);
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
  }, [selectedCompanyId, loader]);

  return { data, loading, error, selectedCompanyId };
}
