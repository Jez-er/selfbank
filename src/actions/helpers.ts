import "server-only";
import { z } from "zod";
import { requireSession } from "@/lib/auth-server";
import { MoneyError } from "@/lib/money";
import { MissingRateError } from "@/lib/fx";
import { fieldErrors, formToObject, type ActionResult } from "@/lib/validation";

export type { ActionResult };

/**
 * Runs an action body with the session checked and every expected failure
 * turned into a field error. Anything unexpected is logged and reported as a
 * generic form error, so a stack trace never reaches the browser.
 */
export async function runAction(
  body: () => ActionResult | Promise<ActionResult>,
): Promise<ActionResult> {
  await requireSession();
  try {
    return await body();
  } catch (error) {
    if (error instanceof MoneyError) {
      return { ok: false, errors: { amount: error.message } };
    }
    if (error instanceof MissingRateError) {
      return { ok: false, errors: { _form: error.message } };
    }
    // `redirect()` and `notFound()` work by throwing; let them through.
    if (isNextControlFlow(error)) throw error;
    console.error("[selfbank] action failed:", error);
    return {
      ok: false,
      errors: { _form: "Не вдалося зберегти. Деталі у логах сервера." },
    };
  }
}

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
      (error as { digest: string }).digest === "NEXT_NOT_FOUND")
  );
}

export class ValidationFailure extends Error {
  constructor(readonly errors: Record<string, string>) {
    super("validation failed");
  }
}

/** Parses FormData with a schema, throwing a ValidationFailure runAction turns into field errors. */
export function parseForm<S extends z.ZodType>(schema: S, form: FormData): z.infer<S> {
  const result = schema.safeParse(formToObject(form));
  if (!result.success) throw new ValidationFailure(fieldErrors(result.error));
  return result.data;
}

/** Wraps `runAction`, additionally mapping ValidationFailure to field errors. */
export async function runFormAction(
  body: () => ActionResult | Promise<ActionResult>,
): Promise<ActionResult> {
  return runAction(async () => {
    try {
      return await body();
    } catch (error) {
      if (error instanceof ValidationFailure) return { ok: false, errors: error.errors };
      throw error;
    }
  });
}
