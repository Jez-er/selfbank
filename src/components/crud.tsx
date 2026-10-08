"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui";
import type { ActionResult } from "@/lib/validation";

type RowAction = (form: FormData) => Promise<ActionResult>;

/**
 * A one-field form wrapping a row action (delete, archive, post now).
 *
 * Each row gets its own form rather than a shared handler, so the actions keep
 * working without JavaScript and the pending state is per row.
 */
export function RowActionForm({
  action,
  id,
  label,
  confirm,
  variant = "ghost",
  size = "sm",
  icon,
  className,
}: {
  action: RowAction;
  id: number;
  label: string;
  /** When set, the browser asks before submitting. */
  confirm?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | undefined, form: FormData) => action(form),
    undefined,
  );

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <PendingButton label={label} variant={variant} size={size} icon={icon} />
      {state?.errors?._form ? (
        <p role="alert" className="mt-1 text-xs text-negative">
          {state.errors._form}
        </p>
      ) : null}
    </form>
  );
}

function PendingButton({
  label,
  variant,
  size,
  icon,
}: {
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  icon?: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      aria-busy={pending}
      title={label}
      aria-label={icon ? label : undefined}
    >
      {icon ?? (pending ? "…" : label)}
    </Button>
  );
}

/** Action with no row id, e.g. "run catch-up now". */
export function BareActionForm({
  action,
  label,
  variant = "secondary",
  size = "sm",
}: {
  action: () => Promise<ActionResult>;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [state, formAction] = useActionState(
    async (_prev: ActionResult | undefined) => action(),
    undefined,
  );
  return (
    <form action={formAction}>
      <PendingButton label={label} variant={variant} size={size} />
      {state?.message ? <p className="mt-1 text-xs text-ink-3">{state.message}</p> : null}
    </form>
  );
}
