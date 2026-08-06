// AI_Image_Provider — geração de imagem por IA (Google Imagen / Nano Banana).
// Usado APENAS como fallback quando Image_Bank retorna null OU quando o
// Content_Brief tem ai_image_optin=true. Requirements 5.1, 5.2.
//
// Se a env var NANO_BANANA_API_KEY / GEMINI_API_KEY não está setada,
// retorna erro claro AI_IMAGE_NOT_CONFIGURED (sem gerar imagem falsa).

import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadGeminiCredentials } from "@/lib/ai-credentials.server";

const BUCKET = "ai-content";
// Modelo de geração de imagem — Google Imagen via Gemini API.
// imagen-3.0-generate-002 é o modelo estável e disponível para novos usuários.
// (imagen-4.0-generate-001 foi descontinuado em 2026 pra novos usuários.)
const DEFAULT_IMAGE_MODEL = process.env.NANO_BANANA_MODEL ?? "imagen-3.0-generate-002";

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

async function getClient(): Promise<GoogleGenAI> {
  try {
    const creds = await loadGeminiCredentials();
    return new GoogleGenAI({ apiKey: creds.apiKey });
  } catch {
    const err = new Error(
      "AI_IMAGE_NOT_CONFIGURED — Gemini não configurado. Super Admin deve preencher a chave em /super-admin/ia.",
    );
    (err as { code?: string }).code = "AI_IMAGE_NOT_CONFIGURED";
    throw err;
  }
}

function enrichPrompt(input: GenerateImageInput): string {
  const parts = [input.prompt];
  if (input.brandColorHint) {
    parts.push(`Paleta principal: ${input.brandColorHint}.`);
  }
  parts.push("Foto profissional, iluminação natural, alta qualidade.");
  return parts.join(" ");
}

/**
 * Gera uma imagem via IA e sobe pro bucket ai-content. Retorna URL pública.
 * NÃO consulta Plan_Quota_Hook — quem chamar deve fazer isso antes.
 */
export async function generateImage(
  input: GenerateImageInput,
): Promise<GenerateImageOutput> {
  const client = await getClient();
  const finalPrompt = enrichPrompt(input);

  const response = await client.models.generateImages({
    model: DEFAULT_IMAGE_MODEL,
    prompt: finalPrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: input.aspectRatio,
    },
  });

  const first = response.generatedImages?.[0];
  const inlineData = first?.image?.imageBytes;
  if (!inlineData) {
    throw new Error("AI_Image_Provider retornou payload vazio");
  }

  // imageBytes vem como string base64
  const bytes = Buffer.from(inlineData, "base64");
  const key = `${input.workspaceOwnerId}/ai-generated/${randomUUID()}.png`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, bytes, { contentType: "image/png", upsert: false });
  if (upErr) {
    throw new Error(`Falha ao subir imagem AI: ${upErr.message}`);
  }
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;

  return {
    url,
    promptUsed: finalPrompt,
    model: DEFAULT_IMAGE_MODEL,
  };
}
