"use client";

import { createContext, useContext, useState } from "react";

interface LokaContextValue {
  isOpen: boolean;
  toggleLoka: () => void;
  openLoka: () => void;
  closeLoka: () => void;
}

const LokaContext = createContext<LokaContextValue>({
  isOpen: false,
  toggleLoka: () => {},
  openLoka: () => {},
  closeLoka: () => {},
});

export function useLoka() {
  return useContext(LokaContext);
}

export function LokaProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <LokaContext.Provider
      value={{
        isOpen,
        toggleLoka: () => setIsOpen((p) => !p),
        openLoka: () => setIsOpen(true),
        closeLoka: () => setIsOpen(false),
      }}
    >
      {children}
    </LokaContext.Provider>
  );
}
