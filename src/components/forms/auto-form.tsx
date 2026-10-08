"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/validation";
import { AmountInput } from "./amount-input";
import type { FieldSpec } from "./types";

type ServerAction = (
  prev: ActionResult | undefined,
  form: FormData,
) => Promise<ActionResult>;

/**
 * Renders a CRUD form from a field spec and wires it to a server action.
 *
 * Errors come back keyed by field name, so each message lands next to the
 * input that caused it. The form posts through a server action, which also
 * means it still submits with JavaScript disabled.
 */
export function AutoForm({
  action,
  fields,
  submitLabel = "Зберегти",
  onDone,
  compact = false,
  children,
}: {
  action: ServerAction;
  fields: FieldSpec[];
  submitLabel?: string;
  /** Rendered after the fields, e.g. a Cancel link. */
  children?: React.ReactNode;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const formId = useId();

  // A successful save clears the inputs for "add another" flows.
  const resetKey = state?.ok ? `${formId}-ok-${state.message ?? ""}` : formId;

  return (
    <form action={formAction} className="space-y-4" key={resetKey} onReset={onDone}>
      {state?.errors?._form ? <Alert tone="negative">{state.errors._form}</Alert> : null}
      {state?.ok && state.message ? (
        <Alert tone="positive">
          {state.message}
          {state.warning ? <p className="mt-1 text-xs">{state.warning}</p> : null}
        </Alert>
      ) : null}
      {state?.ok === false && state.warning ? (
        <Alert tone="warning">{state.warning}</Alert>
      ) : null}

      <div className={cn("grid gap-4", compact ? "sm:grid-cols-1" : "sm:grid-cols-2")}>
        {fields.map((field) => (
          <FieldRenderer
            key={field.name}
            field={field}
            error={state?.errors?.[field.name]}
            compact={compact}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <SubmitButton label={submitLabel} />
        {children}
      </div>
    </form>
  );
}

function FieldRenderer({
  field,
  error,
  compact,
}: {
  field: FieldSpec;
  error?: string;
  compact: boolean;
}) {
  const id = `f-${field.name}`;

  if (field.type === "hidden") {
    return <input type="hidden" name={field.name} value={String(field.defaultValue ?? "")} />;
  }

  if (field.type === "checkbox") {
    return (
      <div className={cn("flex items-start gap-2", field.wide && !compact && "sm:col-span-2")}>
        <input
          id={id}
          name={field.name}
          type="checkbox"
          defaultChecked={Boolean(field.defaultValue)}
          disabled={field.disabled}
          className="mt-0.5 size-4 rounded border-border-strong accent-[var(--color-brand)]"
        />
        <div>
          <label htmlFor={id} className="text-sm text-ink">
            {field.label}
          </label>
          {error ? (
            <p className="text-xs text-negative">{error}</p>
          ) : field.hint ? (
            <p className="text-xs text-ink-3">{field.hint}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const wrapper = cn(field.wide && !compact && "sm:col-span-2");

  if (field.type === "amount") {
    return (
      <Field
        className={wrapper}
        label={field.label ?? ""}
        htmlFor={id}
        hint={field.hint}
        error={error}
      >
        <AmountInput
          id={id}
          name={field.name}
          currency={field.currency ?? "UAH"}
          defaultValue={field.defaultValue == null ? "" : String(field.defaultValue)}
          required={field.required}
          autoFocus={field.autoFocus}
          placeholder={field.placeholder}
        />
      </Field>
    );
  }

  return (
    <Field
      className={wrapper}
      label={field.label ?? ""}
      htmlFor={id}
      hint={field.hint}
      error={error}
    >
      {field.type === "select" ? (
        <Select
          id={id}
          name={field.name}
          defaultValue={field.defaultValue == null ? "" : String(field.defaultValue)}
          required={field.required}
          disabled={field.disabled}
          autoFocus={field.autoFocus}
        >
          {renderOptions(field)}
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          name={field.name}
          defaultValue={field.defaultValue == null ? "" : String(field.defaultValue)}
          placeholder={field.placeholder}
          disabled={field.disabled}
        />
      ) : (
        <Input
          id={id}
          name={field.name}
          type={inputType(field.type)}
          defaultValue={field.defaultValue == null ? "" : String(field.defaultValue)}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          autoFocus={field.autoFocus}
          min={field.min}
          max={field.max}
          step={field.step}
          className={field.type === "color" ? "h-10 p-1" : undefined}
        />
      )}
    </Field>
  );
}

function inputType(type: FieldSpec["type"]): string {
  switch (type) {
    case "date":
      return "date";
    case "month":
      return "month";
    case "number":
      return "number";
    case "color":
      return "color";
    default:
      return "text";
  }
}

function renderOptions(field: FieldSpec) {
  const options = field.options ?? [];
  const grouped = options.some((o) => o.group);
  if (!grouped) {
    return options.map((option) => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    ));
  }

  const ungrouped = options.filter((o) => !o.group);
  const groups = [...new Set(options.filter((o) => o.group).map((o) => o.group!))];
  return (
    <>
      {ungrouped.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
      {groups.map((group) => (
        <optgroup key={group} label={group}>
          {options
            .filter((o) => o.group === group)
            .map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

export function SubmitButton({
  label,
  variant = "primary",
}: {
  label: string;
  variant?: "primary" | "danger" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending}>
      {pending ? "Зберігаю…" : label}
    </Button>
  );
}
