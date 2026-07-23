"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FileSpreadsheet,
  LayoutDashboard,
  MessageSquare,
  PieChart,
  Upload,
  ArrowLeftRight,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/dashboard",           label: "Dashboard",          icon: LayoutDashboard },
  { href: "/benchmark",           label: "Benchmarking",       icon: ArrowLeftRight },
  { href: "/classement",          label: "Classement Marché",  icon: BarChart3 },
  { href: "/financial-statements",label: "États financiers",   icon: FileSpreadsheet },
  { href: "/portfolios",          label: "Portefeuilles",      icon: PieChart },
  { href: "/analysis",            label: "Analyse IA — Loka",  icon: MessageSquare },
  { href: "/import",              label: "Import données",     icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      {/* ── Brand header ── */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {/* SOLVA wordmark — geometric, no icon cliché */}
          <div className="flex flex-col leading-none">
            <span className="text-xl font-black tracking-tight text-sidebar-foreground">
              SOLVA
            </span>
            <span className="text-[10px] font-medium tracking-[0.18em] uppercase text-muted-foreground mt-0.5">
              BH Assurance
            </span>
          </div>
        </div>

        {/* Red accent bar — brand marker */}
        <div className="flex items-center gap-2">
          <div className="h-5 w-0.5 rounded-full bg-[#E4032E]" />
          <ThemeToggle />
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive
                    ? "text-[#E4032E]"
                    : "text-sidebar-foreground/40 group-hover:text-[#2E5C8A]",
                )}
              />
              {item.label}
              {/* Active indicator line */}
              {isActive && (
                <span className="ml-auto h-4 w-0.5 rounded-full bg-[#E4032E]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Footer — market data indicator ── */}
      <div className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5 rounded-lg bg-sidebar-accent px-3 py-2.5">
          <TrendingUp className="h-3.5 w-3.5 text-[#1E9E63] shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-sidebar-foreground truncate">
              Marché TN — FTUSA
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              Données actualisées
            </p>
          </div>
          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[#1E9E63] shrink-0 animate-pulse" />
        </div>
      </div>
    </aside>
  );
}
