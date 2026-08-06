import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutTemplate } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listTemplates } from "@/lib/templates.functions";
import {
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
} from "@/features/content-generation/types";

export const Route = createFileRoute("/_authenticated/content/templates")({
  component: TemplatesPage,
});

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  promo: "Promoção",
  novidade: "Novidade",
  depoimento: "Depoimento",
  agenda: "Agenda",
  dica: "Dica",
  institucional: "Institucional",
  antes_depois: "Antes/Depois",
  catalogo: "Catálogo",
};

function TemplatesPage() {
  const listFn = useServerFn(listTemplates);
  const [category, setCategory] = React.useState<TemplateCategory | undefined>(undefined);
  const q = useQuery({
    queryKey: ["templates", category ?? "all"],
    queryFn: () => listFn({ data: { category } }),
  });

  const templates = q.data?.templates ?? [];

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        <button
          onClick={() => setCategory(undefined)}
          style={pillBtn(category === undefined)}
        >
          Todos
        </button>
        {TEMPLATE_CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)} style={pillBtn(category === c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={32} />}
          title="Sem templates nesta categoria"
          description="Escolha outra categoria."
        />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}
        >
          {templates.map((t) => (
            <Card key={t.id} style={{ padding: 14 }}>
              <div
                style={{
                  aspectRatio: t.ratio === "9:16" ? "9/16" : "1/1",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-control)",
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  fontSize: 24,
                }}
              >
                {t.ratio}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t.id}</div>
              <div className="flex items-center" style={{ gap: 6, marginTop: 4 }}>
                <Badge variant="neutral">{CATEGORY_LABEL[t.category as TemplateCategory]}</Badge>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {t.width}×{t.height}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    borderRadius: "var(--radius-pill)",
    border: "1px solid var(--border)",
    background: active ? "var(--accent-soft, var(--surface-2))" : "var(--surface)",
    color: "var(--text)",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
  };
}
