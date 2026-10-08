import { z } from "zod";
import { isISODate } from "./dates";
import { CURRENCY_CODES } from "./money";

/**
 * One set of schemas for both the browser forms and the server actions, so a
 * client-side bypass cannot write anything the UI would have rejected.
 *
 * Amounts arrive as raw user text ("1 200,50", "450*3") and are parsed with
 * `parseAmount` inside the action, where the target currency is known - the
 * number of decimals depends on it, so it cannot be validated here.
 */

const isoDate = z
  .string()
  .refine(isISODate, { message: "Невірна дата (очікується РРРР-ММ-ДД)" });

const optionalIsoDate = z
  .union([isoDate, z.literal("")])
  .transform((v) => (v === "" ? null : v))
  .nullable();

const id = z.coerce.number().int().positive();
const optionalId = z
  .union([z.coerce.number().int().positive(), z.literal(""), z.literal("0")])
  .transform((v) => (v === "" || v === "0" || v === 0 ? null : Number(v)))
  .nullable()
  .optional();

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Код валюти - 3 символи")
  .max(5)
  .refine((c) => /^[A-Z]{3,5}$/.test(c), { message: "Код валюти має бути літерами" });

const name = z.string().trim().min(1, "Вкажіть назву").max(80, "Занадто довга назва");
const note = z
  .string()
  .trim()
  .max(500, "Нотатка занадто довга")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Колір у форматі #RRGGBB")
  .default("#64748b");

/** Raw amount text; parsed against the account's currency in the action. */
const amountText = z.string().trim().min(1, "Вкажіть суму").max(40);

export const KNOWN_CURRENCIES = CURRENCY_CODES;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const accountSchema = z.object({
  id: id.optional(),
  name,
  type: z.enum(["cash", "card", "savings", "crypto", "other"]).default("cash"),
  currency,
  openingBalance: z.string().trim().default("0"),
  color,
  archived: z.coerce.boolean().default(false),
});

export type AccountInput = z.infer<typeof accountSchema>;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  id: id.optional(),
  name,
  kind: z.enum(["income", "expense"]),
  icon: z.string().trim().max(40).default("circle"),
  color,
  parentId: optionalId,
  archived: z.coerce.boolean().default(false),
});

export type CategoryInput = z.infer<typeof categorySchema>;

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export const transactionSchema = z
  .object({
    id: id.optional(),
    type: z.enum(["income", "expense", "transfer"]),
    accountId: id,
    toAccountId: optionalId,
    amount: amountText,
    /** Credited amount for a cross-currency transfer; blank means "derive it". */
    toAmount: z.string().trim().max(40).optional(),
    categoryId: optionalId,
    goalId: optionalId,
    debtId: optionalId,
    occurredAt: isoDate,
    note,
  })
  .superRefine((value, ctx) => {
    if (value.type === "transfer") {
      if (!value.toAccountId) {
        ctx.addIssue({
          code: "custom",
          path: ["toAccountId"],
          message: "Виберіть рахунок призначення",
        });
      } else if (value.toAccountId === value.accountId) {
        ctx.addIssue({
          code: "custom",
          path: ["toAccountId"],
          message: "Рахунки мають бути різними",
        });
      }
      if (value.categoryId) {
        ctx.addIssue({
          code: "custom",
          path: ["categoryId"],
          message: "Переказ не має категорії",
        });
      }
    } else if (value.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Рахунок призначення лише для переказів",
      });
    }
  });

export type TransactionInput = z.infer<typeof transactionSchema>;

// ---------------------------------------------------------------------------
// Exchange rates
// ---------------------------------------------------------------------------

export const rateSchema = z.object({
  id: id.optional(),
  quote: currency,
  rate: z.coerce.number().positive("Курс має бути більшим за нуль").finite(),
  asOf: isoDate,
});

export type RateInput = z.infer<typeof rateSchema>;

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export const budgetSchema = z.object({
  id: id.optional(),
  categoryId: optionalId,
  amount: amountText,
  startMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Місяць у форматі РРРР-ММ"),
  rollover: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
});

export type BudgetInput = z.infer<typeof budgetSchema>;

// ---------------------------------------------------------------------------
// Recurring rules
// ---------------------------------------------------------------------------

export const recurringSchema = z
  .object({
    id: id.optional(),
    name,
    type: z.enum(["income", "expense", "transfer"]),
    accountId: id,
    toAccountId: optionalId,
    categoryId: optionalId,
    amount: amountText,
    note,
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    intervalCount: z.coerce.number().int().min(1, "Мінімум 1").max(365).default(1),
    dayOfMonth: z
      .union([z.coerce.number().int().min(1).max(31), z.literal("")])
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .optional(),
    weekday: z
      .union([z.coerce.number().int().min(0).max(6), z.literal("")])
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .optional(),
    monthOfYear: z
      .union([z.coerce.number().int().min(1).max(12), z.literal("")])
      .transform((v) => (v === "" ? null : Number(v)))
      .nullable()
      .optional(),
    startDate: isoDate,
    endDate: optionalIsoDate.optional(),
    autoPost: z.coerce.boolean().default(true),
    active: z.coerce.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.type === "transfer" && !value.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Виберіть рахунок призначення",
      });
    }
    if (value.frequency === "weekly" && (value.weekday === null || value.weekday === undefined)) {
      ctx.addIssue({ code: "custom", path: ["weekday"], message: "Виберіть день тижня" });
    }
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Дата завершення раніше за початок",
      });
    }
  });

export type RecurringInput = z.infer<typeof recurringSchema>;

// ---------------------------------------------------------------------------
// Goals & debts
// ---------------------------------------------------------------------------

export const goalSchema = z.object({
  id: id.optional(),
  name,
  target: amountText,
  currency,
  targetDate: optionalIsoDate.optional(),
  accountId: optionalId,
  note,
  archived: z.coerce.boolean().default(false),
});

export type GoalInput = z.infer<typeof goalSchema>;

export const debtSchema = z.object({
  id: id.optional(),
  counterparty: name,
  direction: z.enum(["i_owe", "owed_to_me"]),
  principal: amountText,
  currency,
  dueDate: optionalIsoDate.optional(),
  note,
});

export type DebtInput = z.infer<typeof debtSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsSchema = z.object({
  baseCurrency: currency,
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  /** Field-keyed messages, plus `_form` for errors that are not field-specific. */
  errors?: Record<string, string>;
  message?: string;
  /** Non-blocking note on an otherwise successful write (e.g. a stale FX rate). */
  warning?: string;
}

/** Collapses Zod issues into one message per field for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Reads a FormData into a plain object, dropping empty-string checkboxes. */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (value instanceof File) continue;
    // Unchecked checkboxes are absent; checked ones send "on".
    out[key] = value === "on" ? true : value;
  }
  return out;
}
