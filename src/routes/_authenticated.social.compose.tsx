import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Send, Clock, Save, Image as ImageIcon, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createSocialDraft,
  addSocialPostTarget,
  submitSocialPost,
  listSocialAccounts,
} from "@/lib/social-publishing.functions";
import {
  getSupportedPostTypes,
  validatePostTarget,
  PLATFORM_LABELS,
  POST_TYPE_LABELS,
  type SocialPlatform,
  type PostType,
} from "@/lib/social-post-validation";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/social/compose" as any)({
  component: SocialComposePage,
});

type TargetDraft = {
  connectionId: string;
  platform: SocialPlatform;
  accountName: string;
  postType: PostType | null;
  text: string;
  mediaUrls: string[];
};

function SocialComposePage() {
  const navigate = useNavigate();
  const createDraftFn = useServerFn(createSocialDraft);
  const addTargetFn = useServerFn(addSocialPostTarget);
  const submitFn = useServerFn(submitSocialPost);
  const listAccountsFn = useServerFn(listSocialAccounts);

  const accountsQ = useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => listAccountsFn(),
  });

  const accounts = (accountsQ.data?.accounts ?? []).filter(
    (a: any) => a.status === "connected",
  );

  const [baseText, setBaseText] = React.useState("");
  const [targets, setTargets] = React.useState<TargetDraft[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [scheduleMode, setScheduleMode] = React.useState(false);
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [timezone] = React.useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const addTarget = (account: any) => {
    if (targets.some((t) => t.connectionId === account.id)) return;
    const platform = account.platform as SocialPlatform;
    const types = getSupportedPostTypes(platform);
    setTargets((prev) => [
      ...prev,
      {
        connectionId: account.id,
        platform,
        accountName: account.account_name ?? account.platform,
        postType: types[0] ?? null,
        text: baseText,
        mediaUrls: [],
      },
    ]);
  };

  const removeTarget = (idx: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTarget = (idx: number, patch: Partial<TargetDraft>) => {
    setTargets((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const handleSubmit = async (mode: "now" | "scheduled") => {
    if (targets.length === 0) {
      toast.error("Selecione pelo menos uma conta pra publicar.");
      return;
    }
    // Valida cada target
    for (const t of targets) {
      if (!t.postType) {
        toast.error(`Selecione o tipo de publicação para ${PLATFORM_LABELS[t.platform]}.`);
        return;
      }
      const result = validatePostTarget({
        platform: t.platform,
        postType: t.postType,
        text: t.text,
        mediaItems: t.mediaUrls.map((url) => ({
          type: (url.match(/\.(mp4|mov|webm|avi|3gp)$/i) ? "video" : "image") as "image" | "video",
        })),
      });
      if (!result.valid) {
        toast.error(`${PLATFORM_LABELS[t.platform]}: ${result.violations[0].message}`);
        return;
      }
    }
    if (mode === "scheduled" && !scheduledFor) {
      toast.error("Defina a data e hora do agendamento.");
      return;
    }
    if (mode === "scheduled" && new Date(scheduledFor).getTime() <= Date.now()) {
      toast.error("O horário de agendamento precisa ser no futuro.");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Cria draft
      const { id: postId } = await createDraftFn({ data: { baseText } });
      // 2. Adiciona targets
      const targetIds: string[] = [];
      for (const t of targets) {
        const { id: targetId } = await addTargetFn({
          data: {
            postId,
            connectionId: t.connectionId,
            platform: t.platform,
            postType: t.postType!,
            text: t.text,
            mediaUrls: t.mediaUrls.length > 0 ? t.mediaUrls : undefined,
          },
        });
        targetIds.push(targetId);
      }
      // 3. Submete
      await submitFn({
        data: {
          postId,
          targets: targetIds.map((id) => ({
            targetId: id,
            mode,
            ...(mode === "scheduled" ? { scheduledFor, timezone } : {}),
          })),
        },
      });
      toast.success(mode === "now" ? "Publicando..." : "Post agendado!");
      navigate({ to: "/social/posts" as any });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao publicar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 16, maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
        Novo Post
      </h1>

      {/* Texto base */}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Texto
        </div>
        <textarea
          value={baseText}
          onChange={(e) => {
            setBaseText(e.target.value);
            // Atualiza targets que ainda não foram editados manualmente
            setTargets((prev) =>
              prev.map((t) => (t.text === baseText || !t.text ? { ...t, text: e.target.value } : t)),
            );
          }}
          placeholder="Escreva o texto do seu post..."
          style={{
            width: "100%",
            minHeight: 120,
            padding: 12,
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-control)",
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            fontSize: 14,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      </Card>

      {/* Selecionar contas */}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          Redes sociais
        </div>
        {accounts.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>
            Nenhuma conta conectada.{" "}
            <a href="/social/accounts" style={{ color: "var(--brand-400)" }}>
              Conecte uma conta →
            </a>
          </div>
        ) : (
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {accounts.map((a: any) => {
              const selected = targets.some((t) => t.connectionId === a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => (selected ? undefined : addTarget(a))}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--radius-pill)",
                    border: `1px solid ${selected ? "var(--brand-400)" : "var(--border)"}`,
                    background: selected
                      ? "color-mix(in oklab, var(--brand-400) 14%, transparent)"
                      : "transparent",
                    color: selected ? "var(--brand-400)" : "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: selected ? "default" : "pointer",
                  }}
                >
                  {(PLATFORM_LABELS as any)[a.platform] ?? a.platform}{" "}
                  {a.account_name && `(${a.account_name})`}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Targets individuais */}
      {targets.map((t, idx) => {
        const types = getSupportedPostTypes(t.platform);
        const validation = t.postType
          ? validatePostTarget({
              platform: t.platform,
              postType: t.postType,
              text: t.text,
              mediaItems: t.mediaUrls.map((url) => ({
                type: (url.match(/\.(mp4|mov|webm|avi|3gp)$/i) ? "video" : "image") as "image" | "video",
              })),
            })
          : null;
        return (
          <Card key={t.connectionId} style={{ padding: 16 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {PLATFORM_LABELS[t.platform]}
                </span>
                {t.accountName && (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {t.accountName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeTarget(idx)}
                style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Tipo:</span>
              <select
                value={t.postType ?? ""}
                onChange={(e) => updateTarget(idx, { postType: e.target.value as PostType })}
                style={{
                  height: 30,
                  padding: "0 8px",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: 12,
                }}
              >
                <option value="">Selecione...</option>
                {types.map((pt) => (
                  <option key={pt} value={pt}>
                    {(POST_TYPE_LABELS as any)[pt] ?? pt}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              value={t.text}
              onChange={(e) => updateTarget(idx, { text: e.target.value })}
              placeholder={`Texto para ${PLATFORM_LABELS[t.platform]}...`}
              style={{
                width: "100%",
                minHeight: 80,
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-control)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />

            {validation && !validation.valid && (
              <div style={{ marginTop: 8 }}>
                {validation.violations.map((v, vi) => (
                  <div key={vi} style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>
                    ⚠ {v.message}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {/* Ações */}
      {targets.length > 0 && (
        <Card style={{ padding: 16 }}>
          {scheduleMode && (
            <div className="flex items-center" style={{ gap: 10, marginBottom: 12 }}>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                style={{
                  height: 34,
                  padding: "0 10px",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{timezone}</span>
            </div>
          )}
          <div className="flex items-center" style={{ gap: 8 }}>
            <button
              type="button"
              onClick={() => handleSubmit("now")}
              disabled={submitting}
              className="btn-primary"
            >
              <Send size={14} />
              {submitting ? "Publicando..." : "Publicar agora"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!scheduleMode) {
                  setScheduleMode(true);
                } else {
                  handleSubmit("scheduled");
                }
              }}
              disabled={submitting}
              className="inline-flex items-center"
              style={{
                gap: 6,
                height: 32,
                padding: "0 14px",
                borderRadius: "var(--radius-pill)",
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Clock size={14} />
              {scheduleMode ? "Confirmar agendamento" : "Agendar"}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
