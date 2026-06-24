"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FinancialTable } from "./financial-table";
import type { TableRow } from "@/lib/types";

interface ExpandableSectionsProps {
  rows: TableRow[];
}

const sections = [
  { id: "non-vie", label: "Non-vie" },
  { id: "vie", label: "Vie" },
  { id: "global", label: "Global" },
];

export function ExpandableSections({ rows }: ExpandableSectionsProps) {
  return (
    <Accordion multiple defaultValue={["non-vie", "vie", "global"]} className="w-full">
      {sections.map((section) => (
        <AccordionItem key={section.id} value={section.id}>
          <AccordionTrigger className="text-base font-semibold">
            {section.label}
          </AccordionTrigger>
          <AccordionContent>
            <FinancialTable rows={rows} section={section.label} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
