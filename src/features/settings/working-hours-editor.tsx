import * as React from "react";
import { Plus, X } from "lucide-react";
import {
  DAY_ORDER,
  DAY_LABEL,
  type NormalizedHours,
  type TimeRange,
  type DayKey,
} from "@/lib/working-hours";

// Editor de jornada semanal, com suporte a mais de um bloco por dia
// (ex.: 09:00–12:00 e 14:00–18:00, para quem para pro almoço).
// Compartilhado entre a jornada própria do profissional e, futuramente,
// o horário de funcionamento do negócio.

const DEFAULT_RANGE: TimeRange = { start: "09:00", end: "18:00" };

export function emptyWeek(): NormalizedHours {
  const out: NormalizedHours = {};
  for (const d of DAY_ORDER) {
    out[d] = { active: d !== "sun", ranges: [{ ...DEFAULT_RANGE }] };
  }
  return out;
}

export function WorkingHoursEditor({
  value,
  onChange,
  disabled,
}: {
  value: NormalizedHours;
  onChange: (next: NormalizedHours) => void;
  disabled?: boolean;
}) {
  const patchDay = (day: DayKey, patch: Partial<{ active: boolean; ranges: TimeRange[] }>) => {
    const current = value[day] ?? { active: false, ranges: [] };
    onChange({ ...value, [day]: { ...current, ...patch } });
  };

  return (
    <div className="flex flex-col" style={{ gap: 6, opacity: disabled ? 0.5 : 1 }}>
      {DAY_ORDER.map((day) => {
        const cfg = value[day] ?? { active: false, ranges: [] };
        const ranges = cfg.ranges.length > 0 ? cfg.ranges : [{ ...DEFAULT_RANGE }];
        return (
          <div
            key={day}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--bg-base)",
            }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <label
                className="flex items-center"
                style={{ gap: 6, width: 92, cursor: disabled ? "not-allowed" : "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={cfg.active}
                  disabled={disabled}
                  onChange={(e) =>
                    patchDay(day, {
                      active: e.target.checked,
                      // Marcar um dia sem faixa nenhuma deixaria ele inativo na
                      // normalização — já entrega uma faixa padrão pra editar.
                      ranges: e.target.checked && cfg.ranges.length === 0 ? [{ ...DEFAULT_RANGE }] : cfg.ranges,
                    })
                  }
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{DAY_LABEL[day]}</span>
              </label>

              {!cfg.active ? (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Folga</span>
              ) : (
                <div className="flex flex-col flex-1" style={{ gap: 6 }}>
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center" style={{ gap: 6 }}>
                      <TimeInput
                        value={r.start}
                        disabled={disabled}
                        onChange={(v) => {
                          const next = [...ranges];
                          next[i] = { ...next[i], start: v };
                          patchDay(day, { ranges: next });
                        }}
                      />
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>até</span>
                      <TimeInput
                        value={r.end}
                        disabled={disabled}
                        onChange={(v) => {
                          const next = [...ranges];
                          next[i] = { ...next[i], end: v };
                          patchDay(day, { ranges: next });
                        }}
                      />
                      {ranges.length > 1 && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            patchDay(day, { ranges: ranges.filter((_, idx) => idx !== i) })
                          }
                          aria-label="Remover intervalo"
                          style={iconBtn}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      patchDay(day, { ranges: [...ranges, { start: "14:00", end: "18:00" }] })
                    }
                    style={{
                      alignSelf: "flex-start",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: "var(--radius-control)",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-muted)",
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <Plus size={11} /> intervalo
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 12,
        padding: "4px 6px",
        borderRadius: "var(--radius-control)",
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        color: "var(--text-primary)",
        fontFamily: "monospace",
      }}
    />
  );
}

const iconBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
};
