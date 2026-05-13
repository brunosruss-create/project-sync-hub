import * as React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
};

export function Skeleton({ width, height = 12, radius = 6, style, className, ...rest }: Props) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse ${className ?? ""}`}
      style={{
        width,
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, var(--bg-overlay) 0%, color-mix(in oklab, var(--bg-overlay) 60%, var(--border-strong)) 50%, var(--bg-overlay) 100%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.6s linear infinite",
        ...style,
      }}
      {...rest}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={10} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Skeleton width={36} height={36} radius={999} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Skeleton height={10} width="40%" />
          <Skeleton height={8} width="25%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}
