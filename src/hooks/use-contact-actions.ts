import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";

/**
 * Hook único para mutações de contato.
 * Usado tanto pelo menu ⋮ do card do kanban quanto pelo menu ⋮ do header
 * do painel de chat — sem lógica duplicada.
 *
 * Após cada mutação bem-sucedida, emite `zf:contact-updated` com
 * `{ id, patch }` para que telas que mantêm contatos em estado local
 * (ex.: `_authenticated.inbox.tsx`) atualizem sem refazer o load.
 */

export type ContactPatch = {
  name?: string;
  email?: string | null;
  notes?: string | null;
  tags?: string[];
  priority?: "normal" | "urgent";
  kanban_column?: string;
  assigned_agent_id?: string | null;
  is_blocked?: boolean;
  is_archived?: boolean;
  document_type?: "pessoa_fisica" | "pessoa_juridica" | null;
  document_number?: string | null;
  birth_date?: string | null;
  gender?: "masculino" | "feminino" | "outro" | null;
  profession?: string | null;
  cep?: string | null;
  street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state_uf?: string | null;
};

function emitUpdate(id: string, patch: ContactPatch) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("zf:contact-updated", { detail: { id, patch } }),
  );
}

async function update(id: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from("contacts").update(patch).eq("id", id);
  return error;
}

export function useContactActions() {
  const { user } = useAuth();
  const { workspaceOwnerId } = useWorkspaceOwnerId();

  const saveContact = React.useCallback(
    async (id: string, data: ContactPatch) => {
      const error = await update(id, data);
      if (error) {
        toast.error(error.message ?? "Erro ao salvar contato");
        return false;
      }
      emitUpdate(id, data);
      toast.success("Contato atualizado");
      return true;
    },
    [],
  );

  const addTag = React.useCallback(
    async (id: string, tag: string, currentTags: string[]) => {
      const normalized = tag.trim();
      if (!normalized) return false;
      if (currentTags.includes(normalized)) return false;
      const next = [...currentTags, normalized];
      const error = await update(id, { tags: next });
      if (error) {
        toast.error(error.message ?? "Erro ao adicionar tag");
        return false;
      }
      emitUpdate(id, { tags: next });
      return true;
    },
    [],
  );

  const removeTag = React.useCallback(
    async (id: string, tag: string, currentTags: string[]) => {
      const next = currentTags.filter((t) => t !== tag);
      const error = await update(id, { tags: next });
      if (error) {
        toast.error(error.message ?? "Erro ao remover tag");
        return false;
      }
      emitUpdate(id, { tags: next });
      return true;
    },
    [],
  );

  const toggleUrgent = React.useCallback(
    async (id: string, currentPriority: "normal" | "urgent") => {
      const next: "normal" | "urgent" =
        currentPriority === "urgent" ? "normal" : "urgent";
      const error = await update(id, { priority: next });
      if (error) {
        toast.error(error.message ?? "Erro ao alterar prioridade");
        return false;
      }
      emitUpdate(id, { priority: next });
      toast.success(
        next === "urgent" ? "Marcado como urgente" : "Urgência removida",
      );
      return true;
    },
    [],
  );

  const moveToColumn = React.useCallback(
    async (id: string, column: string) => {
      const error = await update(id, { kanban_column: column });
      if (error) {
        toast.error(error.message ?? "Erro ao mover contato");
        return false;
      }
      emitUpdate(id, { kanban_column: column });
      toast.success("Contato movido");
      return true;
    },
    [],
  );

  const assignAgent = React.useCallback(
    async (id: string, agentId: string | null) => {
      const error = await update(id, { assigned_agent_id: agentId });
      if (error) {
        toast.error(error.message ?? "Erro ao atribuir agente");
        return false;
      }
      emitUpdate(id, { assigned_agent_id: agentId });
      toast.success(agentId ? "Agente atribuído" : "Atribuição removida");
      return true;
    },
    [],
  );

  const transferToAgent = React.useCallback(
    async (id: string, agentId: string, agentName: string) => {
      const error = await update(id, {
        assigned_agent_id: agentId,
        kanban_column: "in_progress",
      });
      if (error) {
        toast.error(error.message ?? "Erro ao transferir");
        return false;
      }
      // Mensagem de sistema. `owner_user_id` é obrigatório: a policy de INSERT
      // exige `owner_user_id = get_my_workspace_owner()`, então sem ele o
      // insert era silenciosamente rejeitado e o aviso "Conversa transferida
      // para X" nunca chegava a aparecer no chat.
      const { error: sysError } = await supabase.from("messages").insert({
        owner_user_id: workspaceOwnerId,
        contact_id: id,
        direction: "system",
        content: `Conversa transferida para ${agentName}`,
        message_type: "system",
      });
      if (sysError) {
        // A transferência em si deu certo; só o aviso no chat falhou.
        console.warn("[transfer] aviso de sistema não gravado:", sysError.message);
      }
      emitUpdate(id, {
        assigned_agent_id: agentId,
        kanban_column: "in_progress",
      });
      toast.success(`Transferido para ${agentName}`);
      return true;
    },
    [workspaceOwnerId],
  );

  /**
   * Grava uma nota interna na conversa.
   *
   * Escrita client-side de propósito: a policy `messages scoped insert` já
   * exige `owner_user_id = get_my_workspace_owner() AND (is_workspace_manager()
   * OR is_contact_visible(contact_id))` — ou seja, o Postgres já garante que o
   * atendente só anota em conversa atribuída a ele. Uma server function teria
   * que reimplementar essa regra à mão com service role, e errar ali seria
   * vazamento entre empresas.
   *
   * A FORMA da linha (direction/message_type/whatsapp_message_id/is_ai) é
   * garantida pela CHECK constraint `messages_internal_shape_chk`, não pela
   * boa memória de quem chama. Ver 20260804000000_messages_internal_notes.sql.
   *
   * Diferente do resto do hook, o erro NÃO é engolido: o chamador precisa saber
   * para manter o texto na caixa. Perder uma nota digitada em silêncio é pior
   * do que qualquer duplicata.
   */
  const addInternalNote = React.useCallback(
    async (contactId: string, content: string) => {
      const text = content.trim();
      if (!text) return false;
      const { data, error } = await supabase
        .from("messages")
        .insert({
          owner_user_id: workspaceOwnerId,
          contact_id: contactId,
          content: text,
          is_internal: true,
          // Estes quatro são a forma canônica da nota — ver constraint.
          // `direction: "system"` é o que faz a nota não casar com nenhum
          // `.eq("direction", …)` do resto do código.
          direction: "system",
          message_type: "system",
          status: "sent",
          is_ai: false,
          sent_by: user?.id ?? null,
          whatsapp_message_id: null,
        })
        .select("id")
        .single();
      if (error) {
        toast.error(error.message ?? "Não foi possível salvar a nota");
        return false;
      }
      return data?.id ?? true;
    },
    [workspaceOwnerId, user?.id],
  );

  const toggleBlock = React.useCallback(
    async (id: string, currentlyBlocked: boolean) => {
      const next = !currentlyBlocked;
      const error = await update(id, { is_blocked: next });
      if (error) {
        toast.error(error.message ?? "Erro ao bloquear contato");
        return false;
      }
      emitUpdate(id, { is_blocked: next });
      toast.success(next ? "Contato bloqueado" : "Contato desbloqueado");
      return true;
    },
    [],
  );

  const archiveContact = React.useCallback(async (id: string) => {
    let error = await update(id, { is_archived: true });
    // Fallback compatível com bancos antigos que não têm a coluna
    if (error && /is_archived/i.test(error.message ?? "")) {
      const retry = await update(id, { kanban_column: "archived" });
      error = retry;
    }
    if (error) {
      toast.error(error.message ?? "Erro ao arquivar");
      return false;
    }
    emitUpdate(id, { is_archived: true });
    toast.success("Contato arquivado");
    return true;
  }, []);

  return {
    saveContact,
    addTag,
    removeTag,
    toggleUrgent,
    moveToColumn,
    assignAgent,
    transferToAgent,
    toggleBlock,
    archiveContact,
    addInternalNote,
  };
}
