"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  ChartPie,
  Goal,
  HandCoins,
  LayoutDashboard,
  Repeat,
  Settings,
  Tags,
  Target,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Дашборд", icon: LayoutDashboard },
  { href: "/transactions", label: "Транзакції", icon: ArrowLeftRight },
  { href: "/accounts", label: "Рахунки", icon: Wallet },
  { href: "/categories", label: "Категорії", icon: Tags },
  { href: "/budgets", label: "Бюджети", icon: Target },
  { href: "/recurring", label: "Регулярні", icon: Repeat },
  { href: "/goals", label: "Цілі", icon: Goal },
  { href: "/debts", label: "Борги", icon: HandCoins },
  { href: "/analytics", label: "Аналітика", icon: ChartPie },
  { href: "/settings", label: "Налаштування", icon: Settings },
] as const;

/** A nav item is active on its own page and on any nested route beneath it. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5" aria-label="Основна навігація">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-brand-soft font-medium text-brand"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Основна навігація"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors",
              active ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
