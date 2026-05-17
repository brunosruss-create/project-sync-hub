function formatDateLabel(d: Date): string {
  const today = new Date();
  const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (ymd(d) === ymd(today)) return "hoje";
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (ymd(d) === ymd(y)) return "ontem";
  const diffDays = (today.getTime() - d.getTime()) / 86_400_000;
  if (diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "long" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function DateSeparator({ date }: { date: Date }) {
  return (
    <div
      className="flex items-center"
      style={{ gap: 8, padding: "12px 0", alignSelf: "stretch" }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          textTransform: "lowercase",
          padding: "2px 10px",
          background: "var(--bg-overlay)",
          borderRadius: 999,
        }}
      >
        {formatDateLabel(date)}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}
