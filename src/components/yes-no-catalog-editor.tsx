import * as React from "react";
import { X } from "lucide-react";
import { YesNoToggle } from "./toggle-row";

// Editor de fatos Sim/Não com catálogo colapsável — usado em Configurações →
// Negócio pra "Informações gerais". Diferente do FieldCatalogEditor do Super
// Admin (que é binário e decide só se um campo é sugerido pro segmento): aqui
// o tenant define o VALOR de cada fato, e pode remover (não se aplica ao meu
// negócio) ou adicionar itens do catálogo completo.
export function YesNoCatalogEditor({
  includedKeys,
  values,
  labels,
  onChangeValue,
  onRemove,
  onAdd,
  emptyText,
}: {
  includedKeys: string[];
  values: Record<string, boolean>;
  labels: Record<string, string>;
  onChangeValue: (key: string, v: boolean | null) => void;
  onRemove: (key: string) => void;
  onAdd: (key: string) => void;
  emptyText: string;
}) {
  const [showCatalog, setShowCatalog] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const restKeys = Object.keys(labels)
    .filter((k) => !includedKeys.includes(k))
    .filter((k) => labels[k].toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      {includedKeys.length > 0 ? (
        <div>
          {includedKeys.map((key) => (
            <div
              key={key}
              className="flex items-center gap-2"
              style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}
            >
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{labels[key] ?? key}</div>
              <YesNoToggle
                value={key in values ? values[key] : null}
                onChange={(v) => onChangeValue(key, v)}
              />
              <button
                type="button"
                onClick={() => onRemove(key)}
                title="Remover — não se aplica ao meu negócio"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{emptyText}</p>
      )}
      <button
        type="button"
        onClick={() => setShowCatalog((v) => !v)}
        style={{
          height: 30,
          padding: "0 10px",
          fontSize: 12,
          marginTop: 8,
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
      >
        {showCatalog ? "Ocultar catálogo" : "+ Adicionar campo do catálogo"}
      </button>
      {showCatalog && (
        <div style={{ marginTop: 10 }}>
          <input
            style={{
              height: 36,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
              width: "100%",
              marginBottom: 6,
            }}
            placeholder="Buscar campo do catálogo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            {restKeys.map((key) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2"
                style={{ padding: "6px 0" }}
              >
                <span style={{ fontSize: 13 }}>{labels[key]}</span>
                <button
                  type="button"
                  onClick={() => onAdd(key)}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    fontSize: 12,
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--brand-400)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  + Adicionar
                </button>
              </div>
            ))}
            {restKeys.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhum campo encontrado.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
