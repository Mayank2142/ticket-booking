import type { HTMLAttributes, ReactNode } from "react";

type CardElement = "article" | "section" | "div";

export function Card({ as: Element = "div", compact = false, elevated = false, className, children, ...props }: HTMLAttributes<HTMLElement> & {
  as?: CardElement;
  compact?: boolean;
  elevated?: boolean;
  children: ReactNode;
}) {
  const classes = ["ui-card", compact ? "ui-card--compact" : "", elevated ? "ui-card--elevated" : "", className ?? ""].filter(Boolean).join(" ");
  return <Element className={classes} {...props}>{children}</Element>;
}
