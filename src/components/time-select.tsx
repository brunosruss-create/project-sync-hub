import * as React from "react";

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
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...style, cursor: disabled ? "default" : "pointer" }}
    >
      {options.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}
