"use client";

import Link from "next/link";
import { Upload, Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useLoka } from "@/components/loka/loka-provider";

interface AppHeaderProps {
  title: string;
  description?: string;
  showImport?: boolean;
}

export function AppHeader({ title, description, showImport = true }: AppHeaderProps) {
  const { selectedCompanyId, setSelectedCompanyId, companies } = useAppStore();
  const { toggleLoka, isOpen } = useLoka();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-card/80 backdrop-blur-md px-8 py-4 shadow-sm">
      {/* Left — page title */}
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight text-foreground truncate">{title}</h1>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>

      {/* Right — controls */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Company selector */}
        {companies.length > 0 && (
          <Select
            value={selectedCompanyId}
            onValueChange={(v) => v && setSelectedCompanyId(v)}
          >
            <SelectTrigger
              className={cn(
                "h-9 w-56 text-xs border-border bg-background",
                "focus:ring-1 focus:ring-[#2E5C8A] focus:border-[#2E5C8A]",
              )}
            >
              <SelectValue placeholder="Sélectionner une compagnie" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Import shortcut */}
        {showImport && (
          <Link
            href="/import"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-border",
              "bg-background px-3 py-2 text-xs font-medium text-muted-foreground",
              "hover:border-[#2E5C8A] hover:text-[#2E5C8A] transition-colors",
            )}
          >
            <Upload className="h-3.5 w-3.5" />
            Importer
          </Link>
        )}

        {/* Loka toggle button — navy-to-steel gradient, always visible */}
        <button
          onClick={toggleLoka}
          aria-label={isOpen ? "Fermer Loka" : "Ouvrir Loka"}
          className={cn(
            "loka-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white",
            "transition-all duration-200 hover:opacity-90 active:scale-95",
            "shadow-sm",
            isOpen && "opacity-80 ring-2 ring-[#2E5C8A]/50",
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Loka
          {isOpen && (
            <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse" />
          )}
        </button>
      </div>
    </header>
  );
}
