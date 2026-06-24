"use client";

import { useEffect } from "react";
import { getCompanies } from "@/lib/mock-api";
import { useAppStore } from "@/lib/store";

export function CompanyBootstrap() {
  const setCompanies = useAppStore((s) => s.setCompanies);

  useEffect(() => {
    getCompanies()
      .then(setCompanies)
      .catch(() => {
        // Static fallback handled inside mock-api
      });
  }, [setCompanies]);

  return null;
}
