import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Images } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listAssets } from "@/lib/content-generation.functions";

export const Route = createFileRoute("/_authenticated/content/assets")({
  component: AssetsListPage,
});

const STATUSES = [
  { key: undefined, label: "Todos" },
  { key: "pending" as const, label: "Aguardando revisão" },
  { key: "approved" as const, label: "Publicados" },
  { key: "rejected" as const, label: "Rejeitados" },
];

function AssetsListPage() {
  const listFn = useServerFn(listAssets);
  const [filter, setFilter] = React.useState<"pending" | "approved" | "rejected" | undefined>(
    "pending",
  );
  const q = useQuery({
    queryKey: ["content-assets", filter ?? "all"],
    queryFn: () => listFn({ data: { limit: 60, approvalStatus: filter } }),
  });

  const assets = q.data?.assets ?? [];

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {STATUSES.map((s) => (
          <button
            key={s.label}
            onClick={() => setFilter(s.key)}
            style={{
              padding: "7px 16px",
              borderRadius: "var(--radius-pill)",
              border: `1px solid ${filter === s.key ? "var(--brand-400)" : "var(--border-strong)"}`,
              background:
                filter === s.key
                  ? "color-mix(in oklab, var(--brand-400) 12%, transparent)"
                  : "var(--bg-surface)",
              color: filter === s.key ? "var(--brand-400)" : "var(--text-primary)",
              fontSize: 12,
              fontWeight: filter === s.key ? 600 : 500,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {assets.length === 0 ? (
        <EmptyState
          icon={<Images size={32} />}
          title="Nenhum post aqui"
          description="Vá em Criar post pra gerar um."
        />
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}
        >
          {assets.map((asset) => (
            <Link
              key={asset.id}
              to="/content/assets/$assetId"
              params={{ assetId: asset.id }}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    aspectRatio: "1",
                    backgroundImage: `url(${asset.renderedImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    background: "var(--bg-overlay)",
                  }}
                />
                <div style={{ padding: 12 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>
                      {asset.targetNetwork}
                    </span>
                    <Badge
                      variant={
                        asset.approvalStatus === "approved"
                          ? "success"
                          : asset.approvalStatus === "rejected"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {asset.approvalStatus === "approved"
                        ? "Publicado"
                        : asset.approvalStatus === "rejected"
                          ? "Rejeitado"
                          : "Aguardando"}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
