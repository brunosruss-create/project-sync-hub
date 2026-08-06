import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, RefreshCw, ArrowLeft, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAsset,
  approveAsset,
  rejectAsset,
  regenerateAsset,
} from "@/lib/content-generation.functions";
import { listSocialAccounts } from "@/lib/social-publishing.functions";
import type { TargetNetwork } from "@/features/content-generation/types";

export const Route = createFileRoute("/_authenticated/content/assets/$assetId")({
  component: AssetDetailPage,
});

const DEFAULT_POST_TYPE: Record<TargetNetwork, string> = {
  facebook: "feed",
  instagram: "feed",
  tiktok: "video",
  youtube: "video",
};

function AssetDetailPage() {
  const { assetId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getAsset);
  const approveFn = useServerFn(approveAsset);
  const rejectFn = useServerFn(rejectAsset);
  const regenFn = useServerFn(regenerateAsset);
  const accountsFn = useServerFn(listSocialAccounts);

  const assetQ = useQuery({
    queryKey: ["content-asset", assetId],
    queryFn: () => getFn({ data: { assetId } }),
  });
  const accountsQ = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => accountsFn(),
  });

  const asset = assetQ.data?.asset;
  const accounts = accountsQ.data?.accounts ?? [];

  const approve = useMutation({
    mutationFn: async () => {
      if (!asset) throw new Error("Asset ainda não carregou");
      const network = asset.targetNetwork;
      const conn = accounts.find(
        (a: any) => a.platform === network && a.status === "connected",
      );
      if (!conn) {
        throw new Error(
          `Nenhuma conta ${network} conectada. Vá em Publicações → conectar.`,
        );
      }
      return approveFn({
        data: {
          assetId,
          connections: { [network]: (conn as any).id } as any,
          postTypes: { [network]: DEFAULT_POST_TYPE[network] } as any,
        },
      });
    },
    onSuccess: () => {
      toast.success("Post enviado para publicação");
      qc.invalidateQueries({ queryKey: ["content-asset", assetId] });
      qc.invalidateQueries({ queryKey: ["content-assets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aprovar"),
  });

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { assetId } }),
    onSuccess: () => {
      toast.success("Post rejeitado");
      nav({ to: "/content/assets" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao rejeitar"),
  });

  const regen = useMutation({
    mutationFn: (mode: "copy_only" | "image_only" | "both") =>
      regenFn({ data: { assetId, mode } }),
    onSuccess: () => {
      toast.success("Regeneração iniciada");
      qc.invalidateQueries({ queryKey: ["content-asset", assetId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao regenerar"),
  });

  if (assetQ.isLoading || !asset) {
    return (
      <div className="flex items-center" style={{ gap: 8, padding: 24 }}>
        <Loader2 size={16} className="animate-spin" />
        <span>Carregando...</span>
      </div>
    );
  }

  const isPending = asset.approvalStatus === "pending";
  const copy = asset.copyBundle;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <button
        onClick={() => nav({ to: "/content/assets" })}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 12,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        <ArrowLeft size={14} />
        Voltar
      </button>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}
      >
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <img
            src={asset.renderedImageUrl}
            alt="Preview"
            style={{ width: "100%", display: "block" }}
          />
          {asset.slides && asset.slides.length > 1 ? (
            <div style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {asset.slides.map((s) => (
                <img
                  key={s.index}
                  src={s.url}
                  alt={`Slide ${s.index}`}
                  style={{
                    width: 60,
                    height: 60,
                    objectFit: "cover",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
          ) : null}
        </Card>

        <div className="flex flex-col" style={{ gap: 12 }}>
          <div className="flex items-center" style={{ gap: 8 }}>
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
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {asset.targetNetwork}
            </span>
          </div>

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              Gancho
            </div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{copy.hook}</div>
          </Card>

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              Corpo
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {copy.body}
            </div>
          </Card>

          {copy.cliffhanger ? (
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                Cliffhanger
              </div>
              <div style={{ fontSize: 13 }}>{copy.cliffhanger}</div>
            </Card>
          ) : null}

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              CTA
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{copy.cta}</div>
          </Card>

          {copy.hashtags.length > 0 ? (
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                Hashtags
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {copy.hashtags.map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 11,
                      color: "var(--accent)",
                      padding: "2px 8px",
                      background: "var(--accent-soft, var(--surface-2))",
                      borderRadius: "var(--radius-pill)",
                    }}
                  >
                    #{h.replace(/^#/, "")}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 8 }}>
          <div className="flex" style={{ gap: 8 }}>
            <button
              onClick={() => regen.mutate("copy_only")}
              disabled={regen.isPending}
              style={secondaryBtn}
            >
              <RefreshCw size={14} />
              Refazer texto
            </button>
            <button
              onClick={() => regen.mutate("image_only")}
              disabled={regen.isPending}
              style={secondaryBtn}
            >
              <RefreshCw size={14} />
              Refazer imagem
            </button>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <button
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
              style={{
                ...secondaryBtn,
                color: "var(--danger, #B91C1C)",
                borderColor: "var(--danger, #B91C1C)",
              }}
            >
              <X size={14} />
              Rejeitar
            </button>
            <button
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              style={primaryBtn}
            >
              {approve.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Aprovar e publicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 20px",
  borderRadius: "var(--radius-pill)",
  background: "var(--accent)",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  borderRadius: "var(--radius-pill)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid var(--border)",
  cursor: "pointer",
};
