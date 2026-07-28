import { FieldHint } from "@/components/field-hint";

export function ToggleRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4" style={{ padding: "8px 0" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {hint && <FieldHint style={{ marginTop: 2 }}>{hint}</FieldHint>}
      </div>
      <SmallToggle value={value} onChange={onChange} />
    </div>
  );
}

export function SmallToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        border: 0,
        background: value ? "var(--brand-400)" : "var(--border)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: value ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "#fff",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

// Tri-state: true (Sim) / false (Não) / null (não informado — nunca deve
// virar "Não" por omissão). Clicar na opção já ativa volta para null.
export function YesNoToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const pill = (active: boolean, selected: boolean) => ({
    height: 28,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    border: "1px solid",
    borderColor: selected ? "var(--brand-400)" : "var(--border)",
    background: selected ? "color-mix(in oklab, var(--brand-400) 15%, transparent)" : "transparent",
    color: selected ? "var(--brand-400)" : "var(--text-muted)",
    cursor: "pointer",
  });
  return (
    <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => onChange(value === true ? null : true)}
        style={pill(true, value === true)}
      >
        Sim
      </button>
      <button
        type="button"
        onClick={() => onChange(value === false ? null : false)}
        style={pill(false, value === false)}
      >
        Não
      </button>
    </div>
  );
}

export function YesNoRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4" style={{ padding: "8px 0" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
        {hint && <FieldHint style={{ marginTop: 2 }}>{hint}</FieldHint>}
      </div>
      <YesNoToggle value={value} onChange={onChange} />
    </div>
  );
}
