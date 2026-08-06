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
  rejectAsset,
  regenerateAsset,
} from "@/lib/content-generation.functions";

export const Route = createFileRoute("/_authenticated/content/assets/$assetId")({
  component: AssetDetailPage,
});

function AssetDetailPage() {
  const { assetId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getAsset);
  const rejectFn = useServerFn(rejectAsset);
  const regenFn = useServerFn(regenerateAsset);

  const assetQ = useQuery({
    queryKey: ["content-asset", assetId],
    queryFn: () => getFn({ data: { assetId } }),
  });

  const asset = assetQ.data?.asset;

  const sendToComposer = () => {
    if (!asset) return;
    const network = asset.targetNetwork;
    const perNet = asset.copyBundle.perNetwork;
    const fullText =
      network === "youtube" && perNet.youtube
        ? `${perNet.youtube.title}\n\n${perNet.youtube.description}`
        : (perNet as any)[network]?.fullText ?? asset.copyBundle.body;
    const params = new URLSearchParams({
      aiAssetId: asset.id,
      network,
      text: fullText,
      mediaUrl: asset.renderedImageUrl,
      hashtags: asset.copyBundle.hashtags.join(","),
    });
    nav({ to: `/social/compose?${params.toString()}` as any });
  };

  const reject = useMutation({
    mutationFn: () => rejectFn({ data: { assetId } }),
    onSuccess: () => {
      toast.success("Post descartado");
      nav({ to: "/content/assets" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao descartar"),
  });

  const regen = useMutation({
    mutationFn: (mode: "copy_only" | "image_only" | "both") =>
      regenFn({ data: { assetId, mode } }),
    onSuccess: () => {
      toast.success("Nova versão sendo gerada");
      qc.invalidateQueries({ queryKey: ["content-asset", assetId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao regenerar"),
  });

  if (assetQ.isLoading || !asset) {
    return (
      <div
        className="flex items-center"
        style={{ gap: 8, padding: 24, color: "var(--text-muted)" }}
      >
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Carregando...</span>
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
          padding: 0,
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 12,
          cursor: "pointer",
          alignSelf: "flex-start",
        }}
      >
        <ArrowLeft size={13} />
        Voltar
      </button>

      <div
        className="grid"
        style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}
      >
        {/* Imagem */}
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
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
          ) : null}
        </Card>

        {/* Texto + status */}
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
                  : "Aguardando revisão"}
            </Badge>
            <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>
              {asset.targetNetwork}
            </span>
          </div>

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Chamada
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{copy.hook}</div>
          </Card>

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Corpo
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              {copy.body}
            </div>
          </Card>

          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Ação final
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--brand-400)" }}>
              {copy.cta}
            </div>
          </Card>

          {copy.hashtags.length > 0 ? (
            <Card style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Hashtags
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {copy.hashtags.map((h) => (
                  <span
                    key={h}
                    style={{
                      fontSize: 11,
                      color: "var(--brand-400)",
                      padding: "3px 10px",
                      background: "color-mix(in oklab, var(--brand-400) 12%, transparent)",
                      borderRadius: "var(--radius-pill)",
                      fontWeight: 500,
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
        <div className="flex flex-wrap items-center justify-between" style={{ gap: 8, paddingTop: 4 }}>
          <div className="flex" style={{ gap: 8 }}>
            <button
              onClick={() => regen.mutate("copy_only")}
              disabled={regen.isPending}
              style={secondaryBtn}
            >
              <RefreshCw size={13} />
              Refazer texto
            </button>
            <button
              onClick={() => regen.mutate("image_only")}
              disabled={regen.isPending}
              style={secondaryBtn}
            >
              <RefreshCw size={13} />
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
                borderColor: "var(--danger, #FCA5A5)",
              }}
            >
              <X size={13} />
              Descartar
            </button>
            <button onClick={sendToComposer} className="btn-primary" style={{ height: 36, fontSize: 13 }}>
              <Check size={13} />
              Revisar e publicar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  borderRadius: "var(--radius-pill)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 500,
  border: "1px solid var(--border-strong)",
  cursor: "pointer",
};
