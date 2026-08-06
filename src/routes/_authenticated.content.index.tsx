import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Plus, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listAssets, listJobs } from "@/lib/content-generation.functions";

export const Route = createFileRoute("/_authenticated/content/")({
  component: ContentHome,
});

function ContentHome() {
  const listAssetsFn = useServerFn(listAssets);
  const listJobsFn = useServerFn(listJobs);

  const assetsQ = useQuery({
    queryKey: ["content-assets", "recent"],
    queryFn: () => listAssetsFn({ data: { limit: 10 } }),
  });

  const jobsQ = useQuery({
    queryKey: ["content-jobs", "recent"],
    queryFn: () => listJobsFn({ data: { limit: 5 } }),
  });

  const assets = assetsQ.data?.assets ?? [];
  const jobs = jobsQ.data?.jobs ?? [];
  const hasActivity = assets.length > 0 || jobs.length > 0;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* CTA principal */}
      <Card style={{ padding: 20 }}>
        <div className="flex items-center justify-between" style={{ gap: 20 }}>
          <div>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
              <Sparkles size={18} style={{ color: "var(--accent)" }} />
              <span style={{ fontSize: 16, fontWeight: 600 }}>Criar um post agora</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Descreva o que você quer comunicar. A IA gera imagem + legenda + hashtags prontos
              para publicar em Facebook, Instagram, TikTok e YouTube.
            </p>
          </div>
          <Link
            to="/content/compose"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: "var(--radius-pill)",
              background: "var(--accent)",
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Plus size={16} />
            Começar
          </Link>
        </div>
      </Card>

      {/* Posts recentes */}
      {!hasActivity ? (
        <EmptyState
          icon={<Sparkles size={32} />}
          title="Nenhum post ainda"
          description="Comece criando seu primeiro post automático. Leva menos de 1 minuto."
        />
      ) : (
        <>
          {jobs.some((j) => j.status === "running") ? (
            <Card style={{ padding: 16 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <Clock size={16} style={{ color: "var(--warning)" }} />
                <span style={{ fontSize: 13 }}>
                  {jobs.filter((j) => j.status === "running").length} post(s) sendo gerados agora
                </span>
              </div>
            </Card>
          ) : null}

          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Posts recentes</h2>
            <div
              className="grid"
              style={{
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 14,
              }}
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
                        background: "var(--surface-2)",
                        backgroundImage: `url(${asset.renderedImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    <div style={{ padding: 12 }}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
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
                              : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
