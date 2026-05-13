import * as React from "react";

export type Strength = 0 | 1 | 2 | 3;

export function scorePassword(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score > 3) score = 3;
  return score as Strength;
}

const labels = ["Muito fraca", "Fraca", "Média", "Forte"];
const colors = ["var(--danger)", "var(--warning)", "#3B82F6", "var(--success)"];

export function PasswordStrength({ value }: { value: string }) {
  const score = scorePassword(value);
  const visible = value.length > 0;

  return (
    <div style={{ minHeight: 18, marginTop: 6 }}>
      {visible && (
        <>
          <div className="flex gap-1" style={{ marginBottom: 4 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: 999,
                  background: i <= score ? colors[score] : "var(--bg-overlay)",
                  transition: "background 150ms var(--ease-default)",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Força: <span style={{ color: colors[score] }}>{labels[score]}</span>
          </div>
        </>
      )}
    </div>
  );
}
