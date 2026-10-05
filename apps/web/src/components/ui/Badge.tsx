import type { HTMLAttributes, ReactNode } from "react";

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", className, children, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return <span className={["ui-badge", `ui-badge--${tone}`, className ?? ""].filter(Boolean).join(" ")} {...props}>{children}</span>;
}
