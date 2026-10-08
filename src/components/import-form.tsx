"use client";

import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { pluralUk } from "@/lib/utils";

/**
 * Restore form. A `replace` wipes the database, so the button spells out how
 * many records are about to go and asks for confirmation - a destructive
 * action should never be one unlabelled click away.
 */
export function ImportForm({ counts }: { counts: Record<string, number> }) {
  const [mode, setMode] = useState("replace");
  const [fileName, setFileName] = useState<string | null>(null);

  const transactions = counts.transactions ?? 0;
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <form
      method="post"
      action="/api/backup/import"
      encType="multipart/form-data"
      className="space-y-3"
      onSubmit={(event) => {
        if (mode !== "replace") return;
        const ok = window.confirm(
          `Режим «замінити» видалить усі поточні дані: ${transactions} ` +
            `${pluralUk(transactions, "операція", "операції", "операцій")}, ` +
            `${totalRows} записів загалом.\n\nПеред заміною буде створено страхувальну копію ` +
            `у теці backups поруч із базою.\n\nПродовжити?`,
        );
        if (!ok) event.preventDefault();
      }}
    >
      <Field label="Файл копії (.json)" htmlFor="backup-file">
        <Input
          id="backup-file"
          type="file"
          name="file"
          accept="application/json,.json"
          required
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          className="h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm"
        />
      </Field>

      <Field
        label="Режим"
        htmlFor="backup-mode"
        hint={
          mode === "replace"
            ? "Повністю замінює поточні дані копією (з автоматичною страхувальною копією)."
            : "Додає відсутні записи. Повторний імпорт того самого файлу нічого не змінить."
        }
      >
        <Select
          id="backup-mode"
          name="mode"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="replace">Замінити все</option>
          <option value="merge">Обʼєднати</option>
        </Select>
      </Field>

      <Button type="submit" variant={mode === "replace" ? "danger" : "primary"}>
        {mode === "replace" ? "Замінити дані" : "Обʼєднати дані"}
      </Button>
      {fileName ? <p className="text-xs text-ink-3">Вибрано: {fileName}</p> : null}
    </form>
  );
}
