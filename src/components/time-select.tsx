import * as React from "react";
import { ChevronDown } from "lucide-react";

/**
 * Gera horários "HH:MM" de 00:00 até 23:30 (ou o último múltiplo de
 * stepMin antes disso), sempre terminando com "23:59" fixo — representa
 * "fim do dia" e é o valor usado pelo fallback de isWithinHours no server
 * (src/lib/ai-respond.server.ts).
 */
export function fullDayTimeSlots(stepMin = 30): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  out.push("23:59");
  return out;
}

/**
 * Select nativo de horário no formato brasileiro (ex: "23:59"). Se o
 * valor atual não bater com nenhuma opção gerada (dado legado/malformado),
 * injeta uma option extra pra não perder o dado do usuário sem ele mexer.
 */
export function TimeSelect({
  value,
  onChange,
  disabled,
  style,
  stepMin = 30,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  stepMin?: number;
}) {
  const slots = React.useMemo(() => fullDayTimeSlots(stepMin), [stepMin]);
  const options = slots.includes(value) || !value ? slots : [...slots, value].sort();

  return (
    <div style={{ position: "relative", width: style?.width, display: "inline-block" }}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...style,
          width: "100%",
          appearance: "none",
          WebkitAppearance: "none",
          paddingRight: 28,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {options.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          color: "var(--text-muted)",
          opacity: disabled ? 0.5 : 1,
        }}
      />
    </div>
  );
}
