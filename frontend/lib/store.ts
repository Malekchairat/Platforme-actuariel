import { create } from "zustand";

export interface CompanyOption {
  id: string;
  name: string;
}

interface AppState {
  selectedCompanyId: string;
  companies: CompanyOption[];
  setSelectedCompanyId: (id: string) => void;
  setCompanies: (companies: CompanyOption[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  selectedCompanyId: "STAR_2025",
  companies: [],
  setSelectedCompanyId: (id) => set({ selectedCompanyId: id }),
  setCompanies: (companies) => {
    const current = get().selectedCompanyId;
    const exists = companies.some((c) => c.id === current);
    set({
      companies,
      selectedCompanyId: exists ? current : (companies[0]?.id ?? current),
    });
  },
}));
