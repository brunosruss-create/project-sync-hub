import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const saveContact = React.useCallback(
    async (
      id: string,
      data: { name?: string; email?: string | null; notes?: string | null },
    ) => {
      const patch = {
        ...data,
        updated_at: new Date().toISOString(),
      };
      const error = await update(id, patch);
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
        next === "urgent" ? "🔴 Marcado como urgente" : "Urgência removida",
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
      // Mensagem de sistema (best-effort: ignora erro se a tabela não aceitar)
      await supabase.from("messages").insert({
        contact_id: id,
        direction: "system",
        content: `Conversa transferida para ${agentName}`,
        message_type: "system",
      } as any);
      emitUpdate(id, {
        assigned_agent_id: agentId,
        kanban_column: "in_progress",
      });
      toast.success(`Transferido para ${agentName}`);
      return true;
    },
    [],
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
      toast.success(next ? "🚫 Contato bloqueado" : "Contato desbloqueado");
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
  };
}
