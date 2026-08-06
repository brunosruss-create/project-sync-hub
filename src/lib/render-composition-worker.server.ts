// Handler do job type "render_composition" — renderiza a composição
// (foto base + camadas) em PNG final e atualiza generated_assets.rendered_image_url.
//
// Roda no worker do Railway (que tem satori + resvg instalados como deps
// nativas). O Vercel serverless não consegue chamar satori/resvg diretamente
// porque marcamos como externals no bundle.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { renderComposition } from "@/features/content-generation/editor/layer-renderer.server";
import type { LayerComposition } from "@/features/content-generation/editor/layer-types";

const BUCKET = "ai-content";

export interface RenderCompositionJobPayload {
  asset_id: string;
}

export async function processRenderCompositionJob(
  payload: RenderCompositionJobPayload,
): Promise<void> {
  const { data: assetRow, error } = await supabaseAdmin
    .from("generated_assets")
    .select("id,owner_user_id,layers_json,base_image_url,rendered_image_url")
    .eq("id", payload.asset_id)
    .single();
  if (error || !assetRow) {
    throw new Error(`Asset não encontrado: ${payload.asset_id}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asset = assetRow as any;

  if (!asset.layers_json) {
    // Nada pra renderizar — asset ainda tem só a foto original.
    console.log(
      `[render-comp-worker] asset ${asset.id} sem layers_json, pulando render`,
    );
    return;
  }

  const baseImageUrl: string = asset.base_image_url ?? asset.rendered_image_url;
  const composition = asset.layers_json as LayerComposition;

  const pngBuffer = await renderComposition({
    imageUrl: baseImageUrl,
    composition,
  });

  const key = `${asset.owner_user_id}/renders-edited/${asset.id}/${randomUUID()}.png`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, pngBuffer, { contentType: "image/png", upsert: false });
  if (upErr) {
    throw new Error(`Falha ao subir PNG renderizado: ${upErr.message}`);
  }
  const newUrl = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  const { error: updErr } = await supabaseAdmin
    .from("generated_assets")
    .update({ rendered_image_url: newUrl })
    .eq("id", asset.id);
  if (updErr) {
    throw new Error(`Falha ao atualizar asset: ${updErr.message}`);
  }
}
