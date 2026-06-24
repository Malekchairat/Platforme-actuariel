import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/financial-transformers";
import type { TableRow as FinancialTableRow } from "@/lib/types";

interface FinancialTableProps {
  rows: FinancialTableRow[];
  section?: string;
}

function capitalize(label: string) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function FinancialTable({ rows, section }: FinancialTableProps) {
  const filtered = section ? rows.filter((r) => r.section === section) : rows;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Indicateur</TableHead>
          <TableHead className="text-right">Montant (TND)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((row) => (
          <TableRow key={`${row.section}-${row.label}`}>
            <TableCell className="font-medium">{capitalize(row.label)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(row.value)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
