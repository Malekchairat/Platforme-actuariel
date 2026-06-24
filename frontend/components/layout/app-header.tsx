"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";

interface AppHeaderProps {
  title: string;
  description?: string;
  showImport?: boolean;
}

export function AppHeader({
  title,
  description,
  showImport = true,
}: AppHeaderProps) {
  const { selectedCompanyId, setSelectedCompanyId, companies } = useAppStore();

  return (
    <header className="flex flex-col gap-4 border-b border-border bg-background px-8 py-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
        {showImport && (
          <Link
            href="/import"
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0 gap-1.5")}
          >
            <Upload className="h-4 w-4" />
            Importer
          </Link>
        )}

        {companies.length > 0 && (
          <Select
            value={selectedCompanyId}
            onValueChange={(value) => value && setSelectedCompanyId(value)}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Sélectionner une compagnie" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </header>
  );
}
