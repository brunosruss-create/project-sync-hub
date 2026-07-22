import { supabase } from "@/integrations/supabase/client";

// Upload de mídia do chat (imagem/documento/áudio) no bucket "chat-media" e devolve a URL pública.
export async function uploadChatMedia(
  file: File,
  userId: string,
  ext?: string,
): Promise<{ url: string; path: string }> {
  if (!userId) throw new Error("Sessão expirada.");
  const safeName = file.name.replace(/[^\w.-]/g, "_").slice(-80);
  const finalExt = ext ?? (safeName.includes(".") ? "" : "bin");
  const path = `${userId}/${Date.now()}-${crypto.randomUUID()}-${safeName}${finalExt ? "." + finalExt : ""}`;
  const { error } = await supabase.storage
    .from("chat-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Upload falhou: ${error.message}`);
  const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
