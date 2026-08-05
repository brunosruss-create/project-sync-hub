import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { useRole } from "@/hooks/use-role";
import { playNotifySound } from "@/lib/notify-sound";

// ============================================================
// Hook global de notificações de mensagens inbound.
//
// Escuta o realtime do Supabase (uma subscription só pra todo o workspace)
// e dispara três efeitos quando chega mensagem inbound:
//
//   1. Atualiza contagem de não lidas no <title> da aba
//   2. Toca beep (se preferência habilitada e a conversa daquele contato
//      NÃO estiver aberta em outra aba do mesmo browser)
//   3. Dispara Notification API do sistema (se preferência habilitada e a
//      aba não está em foco)
//
// Filosofia: a subscription é FILTRADA por `owner_user_id` do workspace.
// Isso evita cada usuário receber o firehose de mudanças globais e vazar
// atividade entre workspaces (o RLS já bloqueia leitura, mas o realtime
// entrega o evento cru — filtro no server-side é mais seguro).
//
// Uso: chamar UMA VEZ no layout autenticado. Não instanciar por página.
// ============================================================

const TITLE_PREFIX = "ZapFlow";

type Prefs = {
  soundEnabled: boolean;
  pushEnabled: boolean;
};

export function useInboundNotifier() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const { isAgent } = useRole();

  // Preferências vêm do profile — default true se coluna ainda não migrada.
  // notify_push já existia; notify_sound_enabled foi adicionado agora.
  const prefs: Prefs = React.useMemo(
    () => ({
      soundEnabled: (profile as any)?.notify_sound_enabled !== false,
      pushEnabled: (profile as any)?.notify_push !== false,
    }),
    [profile],
  );

  const [unreadTotal, setUnreadTotal] = React.useState(0);

  // Base title (título original antes de prefixar contador).
  const baseTitleRef = React.useRef<string>(TITLE_PREFIX);
  React.useEffect(() => {
    // Captura só uma vez o title original — depois disso a gente sobrescreve.
    if (typeof document !== "undefined" && baseTitleRef.current === TITLE_PREFIX) {
      const current = document.title;
      if (current && !/^\(\d+\)/.test(current)) baseTitleRef.current = current;
    }
  }, []);

  // Aplica o contador no title toda vez que muda.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal}) ${baseTitleRef.current}`;
    } else {
      document.title = baseTitleRef.current;
    }
  }, [unreadTotal]);

  // Pede permissão de Notification API na montagem — só a primeira vez.
  // Precisa ser em resposta a evento do usuário em alguns browsers, mas o
  // Chrome/Edge aceitam em qualquer momento (Safari desktop é mais chato).
  React.useEffect(() => {
    if (!prefs.pushEnabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Silencioso: se recusar, o hook simplesmente não dispara push.
      Notification.requestPermission().catch(() => {});
    }
  }, [prefs.pushEnabled]);

  // Carrega contagem inicial de não lidas do workspace.
  React.useEffect(() => {
    if (!user || !workspaceOwnerId) return;
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", workspaceOwnerId)
        .eq("is_unread", true);
      // Atendente só vê o próprio inbox — o total mundial dele confunde.
      // Manager/owner veem tudo do workspace.
      if (isAgent) query = query.eq("assigned_agent_id", user.id);
      const { count, error } = await query;
      if (cancelled) return;
      if (error) {
        console.warn("[notify] contagem inicial falhou:", error.message);
        return;
      }
      setUnreadTotal(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, workspaceOwnerId, isAgent]);

  // Subscription realtime para mensagens novas — dispara efeitos + refetch.
  React.useEffect(() => {
    if (!user || !workspaceOwnerId) return;

    const channel = supabase
      .channel(`inbound-notify:${workspaceOwnerId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `owner_user_id=eq.${workspaceOwnerId}`,
        },
        async (payload: any) => {
          const m = payload.new;
          if (!m || m.direction !== "inbound") return;
          if (m.is_internal) return; // nota interna não é mensagem do cliente

          // Se atendente, só notifica mensagens de contatos atribuídos a ele.
          if (isAgent) {
            const { data: c } = await supabase
              .from("contacts")
              .select("assigned_agent_id")
              .eq("id", m.contact_id)
              .maybeSingle();
            if (c?.assigned_agent_id !== user.id) return;
          }

          // Refetch da contagem — mais barato e correto do que incrementar
          // localmente (concorrência com outros efeitos que também mexem em
          // is_unread deixaria o contador dessincronizado).
          void (async () => {
            let query = supabase
              .from("contacts")
              .select("id", { count: "exact", head: true })
              .eq("owner_user_id", workspaceOwnerId)
              .eq("is_unread", true);
            if (isAgent) query = query.eq("assigned_agent_id", user.id);
            const { count } = await query;
            setUnreadTotal(count ?? 0);
          })();

          // Som: só se aba NÃO está em foco (senão o atendente já está vendo
          // a conversa; tocar seria irritante).
          const focused = typeof document !== "undefined" && !document.hidden;
          if (prefs.soundEnabled && !focused) {
            playNotifySound();
          }

          // Web Push: só se aba não está em foco e permissão foi concedida.
          if (
            prefs.pushEnabled &&
            !focused &&
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            try {
              // Busca nome do contato pra title da notificação.
              const { data: contact } = await supabase
                .from("contacts")
                .select("name")
                .eq("id", m.contact_id)
                .maybeSingle();
              const title = contact?.name ?? "Nova mensagem";
              const body = String(m.content ?? "").slice(0, 140) || "Mídia recebida";
              const n = new Notification(title, { body, tag: m.contact_id });
              n.onclick = () => {
                window.focus();
                // Não navegamos pro contato direto: o click pode não vir na
                // rota certa (SPA) e forçar hard-nav quebraria estado. Focar
                // a aba é o mínimo útil e não invasivo.
                n.close();
              };
            } catch (e: any) {
              console.warn("[notify] push falhou:", e?.message ?? e);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "contacts",
          filter: `owner_user_id=eq.${workspaceOwnerId}`,
        },
        () => {
          // Contato marcado como lido em outra aba/tela → refetch.
          void (async () => {
            let query = supabase
              .from("contacts")
              .select("id", { count: "exact", head: true })
              .eq("owner_user_id", workspaceOwnerId)
              .eq("is_unread", true);
            if (isAgent) query = query.eq("assigned_agent_id", user.id);
            const { count } = await query;
            setUnreadTotal(count ?? 0);
          })();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, workspaceOwnerId, isAgent, prefs.soundEnabled, prefs.pushEnabled]);

  // Reset do title quando o hook desmonta (ex: logout).
  React.useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.title = baseTitleRef.current;
      }
    };
  }, []);
}
