import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Images, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listAssets, listJobs } from "@/lib/content-generation.functions";

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
  const listJobsFn = useServerFn(listJobs);
  const [filter, setFilter] = React.useState<"pending" | "approved" | "rejected" | undefined>(
    "pending",
  );

  // Polling curto quando há jobs rodando — para automaticamente quando tudo termina.
  const jobsQ = useQuery({
    queryKey: ["content-jobs-active"],
    queryFn: () => listJobsFn({ data: { limit: 10 } }),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      const hasActive = jobs.some(
        (j: any) => j.status === "pending" || j.status === "running",
      );
      return hasActive ? 3000 : false;
    },
  });
  const hasActiveJob =
    jobsQ.data?.jobs?.some((j: any) => j.status === "pending" || j.status === "running") ??
    false;

  const q = useQuery({
    queryKey: ["content-assets", filter ?? "all"],
    queryFn: () => listFn({ data: { limit: 60, approvalStatus: filter } }),
    // Enquanto tem job rodando, refetch mais frequente pra pegar o asset assim que sai.
    refetchInterval: hasActiveJob ? 3000 : false,
  });

  const assets = q.data?.assets ?? [];

  const activeJobCount =
    jobsQ.data?.jobs?.filter(
      (j: any) => j.status === "pending" || j.status === "running",
    ).length ?? 0;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {hasActiveJob ? (
        <Card
          style={{
            padding: 14,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            background: "color-mix(in oklab, var(--brand-400) 8%, var(--bg-surface))",
            borderColor: "var(--brand-400)",
          }}
        >
          <Loader2
            size={16}
            className="animate-spin"
            style={{ color: "var(--brand-400)" }}
          />
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
            {activeJobCount === 1
              ? "Gerando 1 post — deve ficar pronto em alguns segundos"
              : `Gerando ${activeJobCount} posts — devem ficar prontos em instantes`}
          </div>
        </Card>
      ) : null}

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
              to="/content/review/$assetId"
              params={{ assetId: asset.id }}
              style={{
                textDecoration: "none",
                color: "inherit",
                display: "block",
                cursor: "pointer",
              }}
            >
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    aspectRatio: "1",
                    backgroundColor: "var(--bg-overlay)",
                    backgroundImage: `url(${asset.renderedImageUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
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
