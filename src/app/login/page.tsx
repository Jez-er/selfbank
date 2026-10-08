import type { Metadata } from "next";
import { Button, Card, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Вхід" };

const ERRORS: Record<string, string> = {
  invalid: "Невірний логін або пароль.",
  throttled: "Забагато спроб. Спробуйте знову за хвилину.",
  config: "Застосунок не налаштований: перевірте AUTH_SECRET і AUTH_PASSWORD_HASH.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS.invalid) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-base font-bold text-brand-ink">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight">SelfBank</span>
        </div>

        <Card className="p-6">
          <h1 className="text-base font-semibold">Вхід у систему</h1>
          <p className="mt-1 mb-5 text-xs text-ink-3">Особиста система обліку грошей</p>

          {message ? (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-negative-soft px-3 py-2 text-xs text-negative"
            >
              {message}
            </p>
          ) : null}

          <form method="post" action="/api/auth/login" className="space-y-4">
            <input type="hidden" name="next" value={next ?? "/"} />
            <Field label="Логін" htmlFor="username">
              <Input id="username" name="username" autoComplete="username" required autoFocus />
            </Field>
            <Field label="Пароль" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button type="submit" className="w-full" size="lg">
              Увійти
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
