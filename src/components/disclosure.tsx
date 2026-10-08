"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Inline "add / edit" panel. A plain <details> would be enough, but the open
 * state has to survive the server action's re-render, so it is held in React.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  variant = "primary",
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: "primary" | "secondary" | "outline";
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Button variant={variant} size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
        {label}
      </Button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
