import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

export const PasswordInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(
            "flex h-9 w-full rounded-md border bg-[var(--bg-base)] pl-3 pr-9 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:border-[var(--brand-400)] focus-visible:ring-2 focus-visible:ring-[var(--brand-400)]/25 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          style={{ borderColor: "var(--border-strong)" }}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((s) => !s)}
          className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 4,
            color: "var(--text-muted)",
            background: "transparent",
          }}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
