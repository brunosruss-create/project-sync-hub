import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";

// ============================================================
// Presence de atendentes por conversa — quem está olhando aquele contato
// AGORA, e quem está digitando. Base: Supabase Realtime Presence.
//
// Modelo:
//   - Canal por contato: `chat:${contactId}`. Cada usuário que abre a
//     conversa entra via track() e vira visível para os outros no mesmo
//     canal (o RLS não protege presence — mas o contactId é uuid opaco,
//     e o payload só carrega nome/avatar/typing, sem dado sensível).
//   - Estado por usuário: { name, avatar, typing, ts }.
//   - Typing: atendente atualiza pra `true` no primeiro keystroke; um
//     timer de 3s desliga sozinho (reagendado a cada tecla).
//
// Uso pelo pai:
//   const { others, setTyping } = useConversationPresence(contactId);
//   // Renderiza avatares de `others` no header
//   // Renderiza "X está digitando…" se algum outro tem typing:true
//   // Composer chama setTyping(true) no onChange
// ============================================================

const TYPING_TIMEOUT_MS = 3000;

export type PresencePeer = {
  userId: string;
  name: string;
  avatar: string | null;
  typing: boolean;
};

export function useConversationPresence(contactId: string | null | undefined) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const [others, setOthers] = React.useState<PresencePeer[]>([]);
  const channelRef = React.useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = React.useRef<number | null>(null);
  const lastSelfStateRef = React.useRef<{ typing: boolean }>({ typing: false });

  // Nome/avatar do usuário local — o Composer/UI dos outros precisa disso.
  const selfName = React.useMemo(
    () =>
      profile?.full_name ||
      (user?.user_metadata?.full_name as string | undefined) ||
      user?.email?.split("@")[0] ||
      "Atendente",
    [profile?.full_name, user?.email, user?.user_metadata],
  );
  const selfAvatar = React.useMemo(
    () => profile?.avatar_url ?? null,
    [profile?.avatar_url],
  );

  // Extrai peers do estado bruto de presence.
  const readOthers = React.useCallback(
    (raw: Record<string, Array<Record<string, any>>>): PresencePeer[] => {
      const list: PresencePeer[] = [];
      for (const key of Object.keys(raw)) {
        const entries = raw[key] ?? [];
        // key = user_id (usamos userId como presence key). Um mesmo usuário
        // aberto em duas abas gera duas entradas — pegamos a mais recente
        // (maior ts). Se qualquer aba dele estiver digitando, mostramos como
        // digitando: cliente ativo ganha.
        if (key === user?.id) continue;
        const latest = entries.reduce<Record<string, any> | null>(
          (best, cur) => (!best || (cur.ts ?? 0) > (best.ts ?? 0) ? cur : best),
          null,
        );
        if (!latest) continue;
        const anyTyping = entries.some((e) => e.typing === true);
        list.push({
          userId: key,
          name: String(latest.name ?? "Atendente"),
          avatar: (latest.avatar as string | null) ?? null,
          typing: anyTyping,
        });
      }
      return list;
    },
    [user?.id],
  );

  // Monta/desmonta o canal quando muda contactId ou usuário.
  React.useEffect(() => {
    if (!contactId || !user?.id) {
      setOthers([]);
      return;
    }

    // presence.key = user.id → dois clientes do mesmo usuário aparecem
    // agrupados sob a mesma chave (evita "dois Brunos" no header).
    const channel = supabase.channel(`chat:${contactId}`, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    const syncOthers = () => {
      setOthers(readOthers(channel.presenceState() as any));
    };

    channel
      .on("presence", { event: "sync" }, syncOthers)
      .on("presence", { event: "join" }, syncOthers)
      .on("presence", { event: "leave" }, syncOthers)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        lastSelfStateRef.current = { typing: false };
        await channel.track({
          name: selfName,
          avatar: selfAvatar,
          typing: false,
          ts: Date.now(),
        });
      });

    return () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      // untrack + removeChannel — sem isso, ao trocar rapidamente de contato
      // o presence anterior fica pendurado até o realtime detectar drop.
      void channel.untrack().catch(() => {});
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setOthers([]);
    };
  }, [contactId, user?.id, selfName, selfAvatar, readOthers]);

  /**
   * Marca ou desmarca "digitando". Idempotente: chamar `setTyping(true)`
   * duas vezes seguidas não gera atualização redundante. Auto-desliga 3s
   * após a última chamada com `true`.
   */
  const setTyping = React.useCallback(
    (typing: boolean) => {
      const channel = channelRef.current;
      if (!channel) return;

      if (typing) {
        // Reagenda desligamento automático.
        if (typingTimerRef.current !== null) {
          window.clearTimeout(typingTimerRef.current);
        }
        typingTimerRef.current = window.setTimeout(() => {
          lastSelfStateRef.current = { typing: false };
          void channel
            .track({ name: selfName, avatar: selfAvatar, typing: false, ts: Date.now() })
            .catch(() => {});
        }, TYPING_TIMEOUT_MS);
        // Só faz track se o estado mudou (evita spam de broadcast).
        if (!lastSelfStateRef.current.typing) {
          lastSelfStateRef.current = { typing: true };
          void channel
            .track({ name: selfName, avatar: selfAvatar, typing: true, ts: Date.now() })
            .catch(() => {});
        }
      } else {
        if (typingTimerRef.current !== null) {
          window.clearTimeout(typingTimerRef.current);
          typingTimerRef.current = null;
        }
        if (lastSelfStateRef.current.typing) {
          lastSelfStateRef.current = { typing: false };
          void channel
            .track({ name: selfName, avatar: selfAvatar, typing: false, ts: Date.now() })
            .catch(() => {});
        }
      }
    },
    [selfName, selfAvatar],
  );

  const typingPeer = others.find((o) => o.typing) ?? null;

  return { others, typingPeer, setTyping };
}
