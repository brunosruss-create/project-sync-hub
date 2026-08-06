// Cache de imagens do Image_Bank no bucket ai-content.
// Hash SHA-256 da URL como filename evita duplicação e permite reuso entre
// jobs do mesmo workspace.

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ImageBankResult } from "@/features/content-generation/types";

const BUCKET = "ai-content";

function hashUrl(url: string, provider: string): string {
  return createHash("sha256")
    .update(`${provider}::${url}`)
    .digest("hex")
    .slice(0, 40);
}

function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Cacheia a imagem do Image_Bank no bucket ai-content e retorna a URL pública.
 * Se já existe no cache, retorna a URL existente sem re-download.
 */
export async function cacheImageBankImage(
  result: ImageBankResult,
  ownerUserId: string,
): Promise<string> {
  const hash = hashUrl(result.url, result.provider);
  const prefix = `${ownerUserId}/image-bank-cache`;
  // Tenta descobrir se já existe
  const { data: existing } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(prefix, { search: hash });
  const match = existing?.find((f) => f.name.startsWith(hash));
  if (match) {
    const key = `${prefix}/${match.name}`;
    return supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
  }

  // Baixa do provedor e sobe pro bucket
  const res = await fetch(result.url);
  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem do provedor: HTTP ${res.status}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const ext = extFromContentType(res.headers.get("content-type"));
  const key = `${prefix}/${hash}.${ext}`;
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, buf, { contentType, upsert: true });
  if (upErr) throw new Error(`Falha ao cachear imagem: ${upErr.message}`);
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}
