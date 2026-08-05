import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { SkeletonCard } from "@/components/skeleton";
import { listSocialPosts } from "@/lib/social-publishing.functions";
import { PLATFORM_LABELS, POST_TYPE_LABELS } from "@/lib/social-post-validation";

export const Route = createFileRoute("/_authenticated/social/posts" )({
  component: SocialPostsPage,
});

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  draft: "neutral",
  scheduled: "info",
  publishing: "warning",
  published: "success",
  failed: "danger",
  partially_published: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  publishing: "Publicando",
  published: "Publicado",
  failed: "Falhou",
  partially_published: "Parcial",
};

function SocialPostsPage() {
  const listFn = useServerFn(listSocialPosts);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["social-posts"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const posts = q.data?.posts ?? [];

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Publicações
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            Gerencie posts para suas redes sociais.
          </p>
        </div>
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            type="button"
            onClick={() => qc.invalidateQueries({ queryKey: ["social-posts"] })}
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
            <RefreshCw size={14} />
            Atualizar
          </button>
          <Link
            to={"/social/compose" as any}
            className="btn-primary"
          >
            <Plus size={14} />
            Novo Post
          </Link>
        </div>
      </div>

      {q.isLoading ? (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Share2 size={40} style={{ color: "var(--brand-400)" }} aria-hidden />}
          title="Nenhuma publicação ainda"
          description="Crie seu primeiro post para publicar nas redes sociais conectadas."
          action={{
            label: "Criar post",
            onClick: () => (window.location.href = "/social/compose"),
          }}
        />
      ) : (
        <div className="flex flex-col" style={{ gap: 10 }}>
          {posts.map((post: any) => (
            <Card key={post.id} style={{ padding: 16 }}>
              <div className="flex items-start justify-between" style={{ gap: 12 }}>
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}
                  >
                    {post.base_text?.slice(0, 80) || "(sem texto)"}
                  </div>
                  <div className="flex items-center" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <Badge variant={STATUS_VARIANT[post.status] ?? "neutral"}>
                      {STATUS_LABEL[post.status] ?? post.status}
                    </Badge>
                    {(post.targets ?? []).map((t: any) => (
                      <span
                        key={t.id}
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--bg-overlay)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {(PLATFORM_LABELS as any)[t.platform] ?? t.platform}{" "}
                        · {(POST_TYPE_LABELS as any)[t.post_type] ?? t.post_type}{" "}
                        · {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {new Date(post.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


