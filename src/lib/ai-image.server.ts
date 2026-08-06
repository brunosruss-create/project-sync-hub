// AI_Image_Provider — geração de imagem por IA.
// Provedor principal: Flux Schnell via fal.ai (barato: ~$0.003/megapixel).
// Fallback secundário: Google Imagen via Gemini API (mais caro, usado só se
// a fal.ai falhar ou não estiver configurada).
//
// Usado como fallback do Image_Bank (Pexels/Unsplash/Pixabay) quando o banco
// não retorna resultado adequado. Requirements 5.1, 5.2.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadGeminiCredentials } from "@/lib/ai-credentials.server";

const BUCKET = "ai-content";

export interface GenerateImageInput {
  prompt: string;
  aspectRatio: "1:1" | "9:16" | "16:9";
  brandColorHint?: string;
  workspaceOwnerId: string;
}

export interface GenerateImageOutput {
  url: string;
  promptUsed: string;
  model: string;
}

function enrichPrompt(input: GenerateImageInput): string {
  const parts = [input.prompt];
  if (input.brandColorHint) {
    parts.push(`Color palette accent: ${input.brandColorHint}.`);
  }
  parts.push(
    "Professional photography, natural lighting, high quality, realistic, commercial photo style.",
  );
  return parts.join(" ");
}

async function uploadToBucket(
  bytes: Buffer,
  workspaceOwnerId: string,
  contentType = "image/png",
): Promise<string> {
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  const key = `${workspaceOwnerId}/ai-generated/${randomUUID()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType, upsert: false });
  if (upErr) {
    throw new Error(`Falha ao subir imagem AI: ${upErr.message}`);
  }
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

// ─── Provedor principal: Flux Schnell via fal.ai ──────────────────

const FAL_MODEL = "fal-ai/flux/schnell";

function falImageSize(aspectRatio: GenerateImageInput["aspectRatio"]): string {
  if (aspectRatio === "9:16") return "portrait_16_9"; // fal usa nomenclatura própria
  if (aspectRatio === "16:9") return "landscape_16_9";
  return "square_hd";
}

async function generateWithFal(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) {
    const err = new Error("FAL_API_KEY não configurada");
    (err as { code?: string }).code = "FAL_NOT_CONFIGURED";
    throw err;
  }

  const finalPrompt = enrichPrompt(input);

  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: finalPrompt,
      image_size: falImageSize(input.aspectRatio),
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fal.ai retornou ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    images?: Array<{ url: string; content_type?: string }>;
  };
  const image = json.images?.[0];
  if (!image?.url) {
    throw new Error("fal.ai retornou payload sem imagem");
  }

  // fal.ai retorna uma URL temporária hospedada por eles — baixamos e
  // re-hospedamos no nosso bucket pra manter controle total (mesmo padrão
  // usado pro Image_Bank).
  const imgRes = await fetch(image.url);
  if (!imgRes.ok) {
    throw new Error(`Falha ao baixar imagem gerada: HTTP ${imgRes.status}`);
  }
  const bytes = Buffer.from(await imgRes.arrayBuffer());
  const contentType = image.content_type ?? "image/png";
  const url = await uploadToBucket(bytes, input.workspaceOwnerId, contentType);

  return { url, promptUsed: finalPrompt, model: "flux-schnell" };
}

// ─── Fallback secundário: Google Imagen via Gemini API ────────────

async function generateWithImagen(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { GoogleGenAI } = await import("@google/genai");
  const creds = await loadGeminiCredentials();
  const client = new GoogleGenAI({ apiKey: creds.apiKey });
  const model = "imagen-3.0-generate-002";
  const finalPrompt = enrichPrompt(input);

  const response = await client.models.generateImages({
    model,
    prompt: finalPrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: input.aspectRatio,
    },
  });

  const first = response.generatedImages?.[0];
  const inlineData = first?.image?.imageBytes;
  if (!inlineData) {
    throw new Error("Imagen retornou payload vazio");
  }

  const bytes = Buffer.from(inlineData, "base64");
  const url = await uploadToBucket(bytes, input.workspaceOwnerId, "image/png");

  return { url, promptUsed: finalPrompt, model };
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Gera uma imagem via IA e sobe pro bucket ai-content. Retorna URL pública.
 * Tenta fal.ai (Flux Schnell, barato) primeiro; se falhar, cai pra Imagen.
 * NÃO consulta Plan_Quota_Hook — quem chamar deve fazer isso antes.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageOutput> {
  try {
    return await generateWithFal(input);
  } catch (falErr) {
    console.warn(
      `[ai-image] fal.ai falhou, tentando Imagen: ${(falErr as Error).message}`,
    );
    try {
      return await generateWithImagen(input);
    } catch (imagenErr) {
      const err = new Error(
        `Ambos provedores de imagem falharam. fal.ai: ${(falErr as Error).message} | Imagen: ${(imagenErr as Error).message}`,
      );
      (err as { code?: string }).code = "AI_IMAGE_NOT_CONFIGURED";
      throw err;
    }
  }
}
