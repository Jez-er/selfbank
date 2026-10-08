import Link from "next/link";
import { LogOut, Plus } from "lucide-react";
import { requireSession } from "@/lib/auth-server";
import { ensureBooted } from "@/lib/boot";
import { MobileNav, SidebarNav } from "@/components/nav";
import { buttonClass } from "@/components/ui";
import { getBaseCurrency } from "@/lib/queries/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The proxy already redirects anonymous browsers; this is the check that
  // actually gates the data.
  await requireSession();
  // Seeds an empty database and arms the recurring scheduler, once per process.
  ensureBooted();
  const baseCurrency = getBaseCurrency();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-3 py-4 lg:flex">
        <Link href="/" className="mb-5 flex items-center gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink">
            S
          </span>
          <span className="font-semibold tracking-tight">SelfBank</span>
        </Link>

        <Link href="/transactions/new" className={buttonClass({ size: "md" }) + " mb-4 w-full"}>
          <Plus className="size-4" aria-hidden />
          Додати операцію
        </Link>

        <div className="flex-1 overflow-y-auto">
          <SidebarNav />
        </div>

        <form method="post" action="/api/auth/logout" className="mt-3 border-t border-border pt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden />
            Вийти
          </button>
          <p className="mt-2 px-3 text-[11px] text-ink-3">Базова валюта: {baseCurrency}</p>
        </form>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 pt-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-xs font-bold text-brand-ink">
              S
            </span>
            <span className="text-sm font-semibold">SelfBank</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/transactions/new" className={buttonClass({ size: "sm" })}>
              <Plus className="size-4" aria-hidden />
              Додати
            </Link>
            <form method="post" action="/api/auth/logout">
              <button
                type="submit"
                aria-label="Вийти"
                className={buttonClass({ variant: "ghost", size: "icon" })}
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        </div>
        <MobileNav />
      </header>

      <main className="min-w-0 px-4 py-5 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
