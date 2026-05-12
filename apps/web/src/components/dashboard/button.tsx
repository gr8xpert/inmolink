import { cn } from "@inmolink/ui";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 text-sm font-medium shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 active:scale-[0.97]";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_6px_16px_rgba(37,99,235,0.25)]",
  secondary: "border border-border bg-card text-foreground hover:bg-muted hover:border-primary/30",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground shadow-none",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3",
  md: "h-9 px-3.5",
};

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

/** Native button with consistent variant + size. */
export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...rest}>
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
};

/** Same look as Button, but renders as a `next/link` anchor. */
export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...rest}>
      {children}
    </Link>
  );
}
