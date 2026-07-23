"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Passer en mode sombre" : "Passer en mode clair"}
      title={theme === "light" ? "Mode sombre" : "Mode clair"}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
        "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className
      )}
    >
      {/* Sun icon — visible in light mode */}
      <Sun
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          theme === "light"
            ? "rotate-0 scale-100 opacity-100"
            : "rotate-90 scale-0 opacity-0"
        )}
      />
      {/* Moon icon — visible in dark mode */}
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          theme === "dark"
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-0 opacity-0"
        )}
      />
    </button>
  );
}
