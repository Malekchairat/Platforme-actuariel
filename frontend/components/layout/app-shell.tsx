"use client";

import { Sidebar } from "./sidebar";
import { LokaProvider } from "@/components/loka/loka-provider";
import { LokaPanel } from "@/components/loka/loka-panel";
import { useLoka } from "@/components/loka/loka-provider";
import { cn } from "@/lib/utils";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { isOpen } = useLoka();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar — fixed width, full height */}
      <Sidebar />

      {/* Main content — shrinks when Loka panel is open */}
      <main
        className={cn(
          "flex-1 overflow-auto transition-all duration-300 min-w-0",
          isOpen && "mr-[400px]",
        )}
      >
        {children}
      </main>

      {/* Loka panel — fixed right overlay */}
      <LokaPanel />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LokaProvider>
      <ShellInner>{children}</ShellInner>
    </LokaProvider>
  );
}
