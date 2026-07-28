import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

const VARIANT_TOKEN: Record<BadgeVariant, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  neutral: "var(--gray-500)",
  brand: "var(--brand-400)",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Ponto colorido antes do texto — usar pra status "vivo" (ex.: agente ativo), não pra toda tag. */
  withDot?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, style, variant = "neutral", withDot, children, ...props }, ref) => {
    const token = VARIANT_TOKEN[variant];
    return (
      <span
        ref={ref}
        className={cn("inline-flex items-center gap-1.5 rounded-full", className)}
        style={{
          fontSize: 11.5,
          fontWeight: 600,
          lineHeight: 1,
          padding: withDot ? "3px 9px 3px 7px" : "3px 9px",
          background: `color-mix(in oklab, ${token} 14%, transparent)`,
          color: token,
          ...style,
        }}
        {...props}
      >
        {withDot && (
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: 999, background: token, flexShrink: 0 }}
          />
        )}
        {children}
      </span>
    );
  },
);
Badge.displayName = "Badge";

export { Badge };
