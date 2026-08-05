// Server functions do módulo de publicação em redes sociais.
// 100% isolado do módulo de mensageria — tabelas, profiles e contas próprias.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  zernioPublishing,
  getSocialProfileId,
  type SocialPlatform,
  type ZernioCreatePostBody,
} from "@/lib/zernio-publishing.server";
import { validatePostTarget, type PostTargetInput } from "@/lib/social-post-validation";

// ============================================================
// Task 4: OAuth — Connect, list, disconnect
// ============================================================

const ConnectSchema = z.object({
  platform: z.enum(["facebook", "instagram", "tiktok", "youtube"]),
});

/** Inicia o fluxo OAuth de conexão de uma conta social para publicação. */
export const getSocialConnectUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const profileId = await getSocialProfileId(context.userId);
    const redirectUrl = `${process.env.VITE_APP_URL ?? "https://hello-tenant-base.vercel.app"}/social/callback`;
    const result = await zernioPublishing.getConnectUrl(
      data.platform as SocialPlatform,
      profileId,
      redirectUrl,
    );
    return { authUrl: result.authUrl };
  });

/** Lista as contas sociais conectadas do workspace (para publicação). */
export const listSocialAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("social_account_connections")
      .select("id,platform,account_id,account_name,status,connected_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: data ?? [] };
  });

const DisconnectSchema = z.object({ connectionId: z.string().uuid() });

/** Desconecta uma conta social (marca status=disconnected). */
export const disconnectSocialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DisconnectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("social_account_connections")
      .update({ status: "disconnected", updated_at: new Date().toISOString() })
      .eq("id", data.connectionId)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Callback de OAuth bem-sucedido: grava a conexão na tabela.
 * Chamado pelo route handler de callback após extrair params da URL.
 */
export const completeSocialConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        platform: z.enum(["facebook", "instagram", "tiktok", "youtube"]),
        accountId: z.string().min(1),
        username: z.string().optional().nullable(),
        profileId: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Upsert: se reconectar uma conta que já existia (ex: token expirado), atualiza.
    const { data: existing } = await supabaseAdmin
      .from("social_account_connections")
      .select("id")
      .eq("owner_user_id", context.userId)
      .eq("platform", data.platform)
      .eq("account_id", data.accountId)
      .maybeSingle();

    if (existing?.id) {
      await supabaseAdmin
        .from("social_account_connections")
        .update({
          status: "connected",
          account_name: data.username ?? null,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("social_account_connections").insert({
        owner_user_id: context.userId,
        platform: data.platform,
        zernio_profile_id: data.profileId,
        account_id: data.accountId,
        account_name: data.username ?? null,
        status: "connected",
        connected_at: new Date().toISOString(),
      });
    }
    return { ok: true };
  });

// ============================================================
// Task 5: CRUD de rascunhos
// ============================================================

/** Cria um post em rascunho. */
export const createSocialDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ baseText: z.string().max(50000).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: post, error } = await supabaseAdmin
      .from("social_posts")
      .insert({
        owner_user_id: context.userId,
        created_by: context.userId,
        base_text: data.baseText ?? "",
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: post.id as string };
  });

const UpdatePostSchema = z.object({
  postId: z.string().uuid(),
  baseText: z.string().max(50000).optional(),
});

/** Atualiza texto base de um post em rascunho. */
export const updateSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdatePostSchema.parse(input))
  .handler(async ({ data, context }) => {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.baseText !== undefined) update.base_text = data.baseText;
    const { error } = await supabaseAdmin
      .from("social_posts")
      .update(update)
      .eq("id", data.postId)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AddTargetSchema = z.object({
  postId: z.string().uuid(),
  connectionId: z.string().uuid(),
  platform: z.enum(["facebook", "instagram", "tiktok", "youtube"]),
  postType: z.string().min(1),
  text: z.string().max(50000).optional(),
  mediaUrls: z.array(z.string().url()).max(35).optional(),
});

/** Adiciona um Post_Target a um post existente. */
export const addSocialPostTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddTargetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: target, error } = await supabaseAdmin
      .from("social_post_targets")
      .insert({
        post_id: data.postId,
        owner_user_id: context.userId,
        social_account_connection_id: data.connectionId,
        platform: data.platform,
        post_type: data.postType,
        text: data.text ?? "",
        media_urls: data.mediaUrls ?? [],
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: target.id as string };
  });

const UpdateTargetSchema = z.object({
  targetId: z.string().uuid(),
  text: z.string().max(50000).optional(),
  postType: z.string().min(1).optional(),
  mediaUrls: z.array(z.string().url()).max(35).optional(),
});

/** Atualiza campos de um Post_Target individual. */
export const updateSocialPostTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateTargetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.text !== undefined) update.text = data.text;
    if (data.postType !== undefined) update.post_type = data.postType;
    if (data.mediaUrls !== undefined) update.media_urls = data.mediaUrls;
    const { error } = await supabaseAdmin
      .from("social_post_targets")
      .update(update)
      .eq("id", data.targetId)
      .eq("owner_user_id", context.userId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const RemoveTargetSchema = z.object({ targetId: z.string().uuid() });

/** Remove um Post_Target em draft. */
export const removeSocialPostTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemoveTargetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("social_post_targets")
      .delete()
      .eq("id", data.targetId)
      .eq("owner_user_id", context.userId)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeletePostSchema = z.object({ postId: z.string().uuid() });

/** Deleta um post inteiro (somente se todos os targets estão em draft). */
export const deleteSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeletePostSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verifica se todos os targets estão em draft
    const { data: targets } = await supabaseAdmin
      .from("social_post_targets")
      .select("status")
      .eq("post_id", data.postId)
      .eq("owner_user_id", context.userId);
    const nonDraft = (targets ?? []).filter((t: any) => t.status !== "draft");
    if (nonDraft.length > 0) {
      throw new Error("Não é possível deletar um post que já tem targets agendados ou publicados.");
    }
    // Cascade deleta os targets
    const { error } = await supabaseAdmin
      .from("social_posts")
      .delete()
      .eq("id", data.postId)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lista posts do workspace com seus targets. */
export const listSocialPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: posts, error } = await supabaseAdmin
      .from("social_posts")
      .select("id,base_text,status,created_at,updated_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    // Busca targets de todos os posts de uma vez
    const postIds = (posts ?? []).map((p: any) => p.id);
    let targets: any[] = [];
    if (postIds.length > 0) {
      const { data: t } = await supabaseAdmin
        .from("social_post_targets")
        .select("id,post_id,platform,post_type,status,scheduled_for,published_at,error_message")
        .in("post_id", postIds);
      targets = t ?? [];
    }
    return {
      posts: (posts ?? []).map((p: any) => ({
        ...p,
        targets: targets.filter((t: any) => t.post_id === p.id),
      })),
    };
  });

// ============================================================
// Task 7: Agendamento e publicação
// ============================================================

const SubmitTargetSchema = z.object({
  targetId: z.string().uuid(),
  mode: z.enum(["now", "scheduled"]),
  scheduledFor: z.string().datetime().optional(),
  timezone: z.string().min(1).optional(),
});

const SubmitPostSchema = z.object({
  postId: z.string().uuid(),
  targets: z.array(SubmitTargetSchema).min(1),
});

/** Submete um post para publicação (imediata ou agendada). */
export const submitSocialPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitPostSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ownerUserId = context.userId;

    // Busca targets com dados completos
    const targetIds = data.targets.map((t) => t.targetId);
    const { data: dbTargets, error: tErr } = await supabaseAdmin
      .from("social_post_targets")
      .select("id,post_id,social_account_connection_id,platform,post_type,text,media_urls,status")
      .eq("owner_user_id", ownerUserId)
      .in("id", targetIds);
    if (tErr) throw new Error(tErr.message);
    if (!dbTargets || dbTargets.length !== data.targets.length) {
      throw new Error("Um ou mais targets não encontrados ou não pertencem a este workspace.");
    }

    // Verifica que todos estão em draft
    for (const t of dbTargets) {
      if ((t as any).status !== "draft") {
        throw new Error(`Target ${(t as any).id} já foi submetido (status: ${(t as any).status}).`);
      }
    }

    // Valida conexões ativas
    const connIds = [...new Set(dbTargets.map((t: any) => t.social_account_connection_id))];
    const { data: conns } = await supabaseAdmin
      .from("social_account_connections")
      .select("id,account_id,status,platform")
      .in("id", connIds);
    const connMap = new Map((conns ?? []).map((c: any) => [c.id, c]));
    for (const t of dbTargets) {
      const conn = connMap.get((t as any).social_account_connection_id);
      if (!conn || conn.status !== "connected") {
        throw new Error(`Conta ${conn?.platform ?? "?"} não está conectada. Reconecte antes de publicar.`);
      }
    }

    // Valida conteúdo
    for (const t of dbTargets) {
      const row = t as any;
      const mediaUrls: string[] = Array.isArray(row.media_urls) ? row.media_urls : [];
      const input: PostTargetInput = {
        platform: row.platform,
        postType: row.post_type,
        text: row.text ?? "",
        mediaItems: mediaUrls.map((url: string) => ({
          type: (url.match(/\.(mp4|mov|webm|avi|3gp)$/i) ? "video" : "image") as "image" | "video",
        })),
      };
      const result = validatePostTarget(input);
      if (!result.valid) {
        throw new Error(
          `Validação falhou para ${row.platform} (${row.post_type}): ${result.violations[0].message}`,
        );
      }
    }

    // Valida scheduledFor
    for (const t of data.targets) {
      if (t.mode === "scheduled") {
        if (!t.scheduledFor) throw new Error("scheduledFor é obrigatório para modo agendado.");
        if (!t.timezone) throw new Error("timezone é obrigatório para modo agendado.");
        if (new Date(t.scheduledFor).getTime() <= Date.now()) {
          throw new Error("O horário de agendamento precisa ser no futuro.");
        }
      }
    }

    // Monta body para a Zernio
    const profileId = await getSocialProfileId(ownerUserId);
    const targetMap = new Map(data.targets.map((t) => [t.targetId, t]));

    // Agrupa por modo (all now, all scheduled com mesmo horário, ou misto — misto precisa de N chamadas)
    // Simplificação: 1 chamada por target para suportar mix de agora/agendado
    const results: Array<{ targetId: string; ok: boolean; error?: string }> = [];

    for (const dbTarget of dbTargets) {
      const row = dbTarget as any;
      const spec = targetMap.get(row.id)!;
      const conn = connMap.get(row.social_account_connection_id)!;
      const mediaUrls: string[] = Array.isArray(row.media_urls) ? row.media_urls : [];

      const body: ZernioCreatePostBody = {
        content: row.text ?? "",
        mediaItems: mediaUrls.map((url: string) => ({
          url,
          type: (url.match(/\.(mp4|mov|webm|avi|3gp)$/i) ? "video" : "image") as "image" | "video",
        })),
        platforms: [
          {
            platform: row.platform as SocialPlatform,
            accountId: conn.account_id,
          },
        ],
        ...(spec.mode === "now" ? { publishNow: true } : {}),
        ...(spec.mode === "scheduled"
          ? { scheduledFor: spec.scheduledFor, timezone: spec.timezone }
          : {}),
      };

      try {
        const resp = await zernioPublishing.createPost(body);
        const zernioPost = resp.post;
        const zernioTarget = zernioPost.platforms[0];

        // Atualiza o target local
        await supabaseAdmin
          .from("social_post_targets")
          .update({
            status: spec.mode === "now" ? "publishing" : "scheduled",
            scheduled_for: spec.scheduledFor ?? null,
            timezone: spec.timezone ?? null,
            zernio_post_id: zernioPost._id,
            zernio_target_id: zernioTarget._id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        // Insere attempt inicial
        await supabaseAdmin.from("social_publish_attempts").insert({
          post_target_id: row.id,
          owner_user_id: ownerUserId,
          attempt_number: 1,
          result: "pending",
          started_at: new Date().toISOString(),
        });

        results.push({ targetId: row.id, ok: true });
      } catch (e: any) {
        // Falha no envio: marca como failed
        await supabaseAdmin
          .from("social_post_targets")
          .update({
            status: "failed",
            error_message: e?.message ?? "Falha ao enviar para a rede.",
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        results.push({ targetId: row.id, ok: false, error: e?.message });
      }
    }

    // Atualiza status agregado do post
    const postId = (dbTargets[0] as any).post_id;
    const { data: allTargets } = await supabaseAdmin
      .from("social_post_targets")
      .select("status")
      .eq("post_id", postId);
    const statuses = (allTargets ?? []).map((t: any) => t.status);
    let postStatus = "draft";
    if (statuses.every((s: string) => s === "published")) postStatus = "published";
    else if (statuses.every((s: string) => s === "failed")) postStatus = "failed";
    else if (statuses.some((s: string) => s === "published") && statuses.some((s: string) => s === "failed"))
      postStatus = "partially_published";
    else if (statuses.some((s: string) => s === "scheduled")) postStatus = "scheduled";
    else if (statuses.some((s: string) => s === "publishing")) postStatus = "publishing";

    await supabaseAdmin
      .from("social_posts")
      .update({ status: postStatus, updated_at: new Date().toISOString() })
      .eq("id", postId);

    return { results };
  });

// ============================================================
// Task 9: Retry de Post_Target com falha
// ============================================================

const RetrySchema = z.object({ targetId: z.string().uuid() });

/** Retenta publicação de um Post_Target que falhou. */
export const retrySocialPostTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RetrySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: target, error: tErr } = await supabaseAdmin
      .from("social_post_targets")
      .select("id,social_account_connection_id,platform,post_type,text,media_urls,status,zernio_post_id")
      .eq("id", data.targetId)
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (tErr || !target) throw new Error("Target não encontrado.");
    if ((target as any).status !== "failed") {
      throw new Error("Só é possível retentar targets com status 'failed'.");
    }

    // Verifica conexão
    const { data: conn } = await supabaseAdmin
      .from("social_account_connections")
      .select("id,account_id,status")
      .eq("id", (target as any).social_account_connection_id)
      .maybeSingle();
    if (!conn || (conn as any).status !== "connected") {
      throw new Error("Conta não está conectada. Reconecte antes de retentar.");
    }

    // Conta attempts existentes
    const { count } = await supabaseAdmin
      .from("social_publish_attempts")
      .select("id", { count: "exact", head: true })
      .eq("post_target_id", data.targetId);
    const nextAttempt = (count ?? 0) + 1;

    // Re-submete à Zernio
    const row = target as any;
    const mediaUrls: string[] = Array.isArray(row.media_urls) ? row.media_urls : [];
    const profileId = await getSocialProfileId(context.userId);

    const body: ZernioCreatePostBody = {
      content: row.text ?? "",
      mediaItems: mediaUrls.map((url: string) => ({
        url,
        type: (url.match(/\.(mp4|mov|webm|avi|3gp)$/i) ? "video" : "image") as "image" | "video",
      })),
      platforms: [
        {
          platform: row.platform as SocialPlatform,
          accountId: (conn as any).account_id,
        },
      ],
      publishNow: true,
    };

    try {
      const resp = await zernioPublishing.createPost(body);
      const zernioPost = resp.post;
      const zernioTarget = zernioPost.platforms[0];

      await supabaseAdmin
        .from("social_post_targets")
        .update({
          status: "publishing",
          error_message: null,
          zernio_post_id: zernioPost._id,
          zernio_target_id: zernioTarget._id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.targetId);

      await supabaseAdmin.from("social_publish_attempts").insert({
        post_target_id: data.targetId,
        owner_user_id: context.userId,
        attempt_number: nextAttempt,
        result: "pending",
        started_at: new Date().toISOString(),
      });

      return { ok: true };
    } catch (e: any) {
      await supabaseAdmin.from("social_publish_attempts").insert({
        post_target_id: data.targetId,
        owner_user_id: context.userId,
        attempt_number: nextAttempt,
        result: "failure",
        error_message: e?.message ?? "Falha",
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      });
      throw new Error(e?.message ?? "Falha ao retentar publicação.");
    }
  });
