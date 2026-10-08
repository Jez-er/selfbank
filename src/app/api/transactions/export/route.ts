import type { NextRequest } from "next/server";
import { requireSessionOr401 } from "@/lib/auth-server";
import { allMatchingTransactions } from "@/lib/queries/transactions";
import { getBaseCurrency } from "@/lib/queries/settings";
import { parseFilters } from "@/lib/filters";
import { minorToInputValue } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = [
  "date",
  "type",
  "amount",
  "currency",
  "amount_base",
  "base_currency",
  "account",
  "to_account",
  "category",
  "goal",
  "debt",
  "note",
];

/** CSV of the current filter selection - a report, not a backup. */
export async function GET(request: NextRequest) {
  const { response } = await requireSessionOr401();
  if (response) return response;

  const url = new URL(request.url);
  const baseCurrency = getBaseCurrency();
  const filters = parseFilters(Object.fromEntries(url.searchParams), baseCurrency);
  const rows = allMatchingTransactions(filters);

  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.occurredAt,
        row.type,
        minorToInputValue(row.amountMinor, row.currency),
        row.currency,
        minorToInputValue(row.baseAmountMinor, baseCurrency),
        baseCurrency,
        row.accountName,
        row.toAccountName ?? "",
        row.categoryName ?? "",
        row.goalName ?? "",
        row.debtName ?? "",
        row.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const name = `selfbank-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  // A BOM makes Excel open UTF-8 Cyrillic correctly instead of as mojibake.
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}

function csvCell(value: string): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
