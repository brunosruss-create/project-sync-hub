import * as React from "react";
import {
  X,
  MoreVertical,
  CheckCheck,
  UserPlus,
  AlertOctagon,
  Tag,
  Ban,
  ExternalLink,
  Check,
  CalendarPlus,
  FileText,
  Download,
  ChevronDown,
  Trash2,
  Bot,
  MessageCircle,
  User,
  ClipboardList,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { Composer, type ComposerMode } from "@/components/chat/Composer";
import { ContactForm } from "@/components/contact/ContactForm";
import { type ContactCard as Contact, formatRelative, formatPhone, initials } from "./data";
import { mediaTypeIcon, mediaKindLabel, type MediaKind } from "@/lib/media-type-icon";
import { ContactAvatar } from "./contact-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceOwnerId } from "@/hooks/use-workspace-owner";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendWhatsAppMessage, refreshContactAvatar, sendWhatsAppMedia, sendWhatsAppAudio, reactToMessage, deleteMessageForEveryone, editMessage } from "@/lib/evolution.functions";
import { ScheduleModal } from "./schedule-modal";
import { MessageActions } from "./message-actions";
import { ForwardModal, type ForwardSource } from "./forward-modal";
import { TransferConversationModal } from "./transfer-conversation-modal";
import { TemplatePickerModal } from "./template-picker-modal";
import { AudioPlayerWithMe } from "@/components/chat/AudioPlayer";
import { DateSeparator } from "@/components/chat/DateSeparator";
import { uploadChatMedia } from "@/lib/chat-media";
import { blobToWav } from "@/lib/audio-wav";
import {
  formatCurrencyBRL,
  formatDuration,
  type Service,
  type ServiceStatus,
} from "@/features/services/data";
import { useContactActions } from "@/hooks/use-contact-actions";
import { useQuery } from "@tanstack/react-query";
import { listQuickReplies } from "@/lib/quick-replies.functions";
import { getWorkspaceProfile } from "@/lib/onboarding.functions";
import { listAssignableMembers } from "@/lib/assignment.functions";


type Tab = "conversation" | "contact" | "services" | "history";

const TABS: Array<{ id: Tab; label: string; Icon: LucideIcon }> = [
  { id: "conversation", label: "Conversa", Icon: MessageCircle },
  { id: "contact", label: "Contato", Icon: User },
  { id: "services", label: "Serviços", Icon: Tag },
  { id: "history", label: "Histórico", Icon: ClipboardList },
];

interface Message {
  id: string;
  // "system" já circulava antes de nota interna (avisos de transferência e de
  // agendamento) — o tipo é que estava mentindo.
  direction: "inbound" | "outbound" | "system";
  content: string;
  /** Nota interna da equipe: nunca foi ao WhatsApp e nunca entra no contexto da IA. */
  is_internal?: boolean;
  message_type: "text" | "image" | "audio" | "video" | "document" | "system";
  status: "sent" | "delivered" | "read";
  created_at: Date;
  media_url?: string | null;
  media_mime?: string | null;
  media_name?: string | null;
  whatsapp_message_id?: string | null;
  quoted_preview?: { content?: string; author?: string; message_type?: string } | null;
  reactions?: Array<{ emoji: string; from: string }> | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  is_ai?: boolean;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Quantas mensagens por página. O chat abre com uma; o resto vem ao rolar. */
const MESSAGE_PAGE_SIZE = 40;

const MESSAGE_COLS_BASE =
  "id,direction,content,message_type,status,created_at,media_url,media_mime,media_name,whatsapp_message_id,quoted_preview,reactions,deleted_at,edited_at,is_ai";

function mapMessageRow(r: any): Message {
  return {
    id: r.id,
    direction: r.direction,
    content: r.content,
    message_type: r.message_type ?? "text",
    status: r.status ?? "sent",
    created_at: new Date(r.created_at),
    media_url: r.media_url ?? null,
    media_mime: r.media_mime ?? null,
    media_name: r.media_name ?? null,
    whatsapp_message_id: r.whatsapp_message_id ?? null,
    quoted_preview: r.quoted_preview ?? null,
    reactions: r.reactions ?? [],
    deleted_at: r.deleted_at ?? null,
    edited_at: r.edited_at ?? null,
    is_ai: !!r.is_ai,
    is_internal: !!r.is_internal,
  };
}

/**
 * Uma página de mensagens, da mais nova para a mais antiga. `before` busca o
 * lote anterior (rolagem para cima); null busca as últimas.
 *
 * Degradação ABERTA: se `is_internal` ainda não existe no banco (migration não
 * aplicada), a query falharia com 42703 e o chat abriria vazio — blackout de
 * conversa para o workspace inteiro. Repetimos sem a coluna e tratamos tudo
 * como não-nota. (Nas leituras da IA a escolha é a oposta: lá falha FECHADA.)
 */
async function fetchMessagePage(
  contactId: string,
  before: Date | null,
  onNotesAvailable: (v: boolean) => void,
): Promise<Message[] | null> {
  const build = (cols: string) => {
    let q = supabase
      .from("messages")
      .select(cols)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE);
    if (before) q = q.lt("created_at", before.toISOString());
    return q;
  };

  let { data, error } = await build(`${MESSAGE_COLS_BASE},is_internal`);
  if (error && /is_internal/i.test(error.message ?? "")) {
    const retry = await build(MESSAGE_COLS_BASE);
    data = retry.data as any;
    error = retry.error;
    onNotesAvailable(false);
  } else if (!error) {
    onNotesAvailable(true);
  }

  if (error) {
    console.warn("[chat] erro ao carregar mensagens:", error.message);
    return null;
  }
  return (data ?? []).map(mapMessageRow);
}

const MAX_CHARS = 4096;

function seedMessages(c: Contact): Message[] {
  return [
    {
      id: "s1",
      direction: "inbound",
      content: "Oi, tudo bem? Vi o anúncio e queria saber mais.",
      message_type: "text",
      status: "read",
      created_at: new Date(Date.now() - 12 * 60_000),
    },
    {
      id: "s2",
      direction: "outbound",
      content: "Olá! Tudo ótimo, e contigo? Como posso ajudar hoje?",
      message_type: "text",
      status: "read",
      created_at: new Date(Date.now() - 11 * 60_000),
    },
    {
      id: "s3",
      direction: "inbound",
      content: "Atribuído para João",
      message_type: "system",
      status: "read",
      created_at: new Date(Date.now() - 10 * 60_000),
    },
    {
      id: "s4",
      direction: "inbound",
      content: c.lastMessage,
      message_type: "text",
      status: "delivered",
      created_at: c.lastMessageAt,
    },
  ];
}

export function ConversationPanel({
  contact,
  onClose,
  onContactUpdate,
  /**
   * Aba que abre ativa. A ordem visual das abas não muda — só qual delas vem
   * selecionada. A tela de Clientes passa "contact" (lá a ficha é o objetivo,
   * não a conversa); o Kanban usa o default.
   */
  initialTab = "conversation",
  /**
   * Como o painel se apresenta. "drawer" (padrão) é a gaveta sobreposta que o
   * Kanban e a tela de Clientes usam. "inline" preenche o container do pai,
   * para a tela de Conversas, que é lista à esquerda e conversa à direita.
   *
   * A alternativa seria um segundo componente de chat — foi o que existia
   * antes, e cada feature nova nascia só num dos lados.
   */
  variant = "drawer",
  /**
   * Conteúdo extra no canto direito da linha de identidade. A tela de
   * Conversas usa isto para as ações globais (buscar/tema/sair), que lá não
   * têm topbar própria — assim elas dividem a linha do nome do contato em vez
   * de ocupar uma fileira só delas.
   */
  headerExtra,
}: {
  contact: Contact | null;
  onClose: () => void;
  onContactUpdate?: (contactId: string, patch: Partial<Contact>) => void;
  initialTab?: Tab;
  variant?: "drawer" | "inline";
  headerExtra?: React.ReactNode;
}) {
  const { user } = useAuth();
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const sendViaEvolution = useServerFn(sendWhatsAppMessage);
  const sendMediaFn = useServerFn(sendWhatsAppMedia);
  const sendAudioFn = useServerFn(sendWhatsAppAudio);
  const refreshAvatar = useServerFn(refreshContactAvatar);
  const reactFn = useServerFn(reactToMessage);
  const deleteFn = useServerFn(deleteMessageForEveryone);
  const editFn = useServerFn(editMessage);
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [draft, setDraft] = React.useState("");
  const [composerMode, setComposerMode] = React.useState<ComposerMode>("reply");
  // Buffer separado de propósito: se resposta e nota dividissem o mesmo draft,
  // trocar de modo com texto digitado deixaria a anotação na caixa de envio.
  const [noteDraft, setNoteDraft] = React.useState("");
  /**
   * A coluna `is_internal` existe neste banco? Detectado no load das mensagens.
   * Enquanto a migration não roda, o toggle de nota nem aparece — melhor não
   * oferecer do que oferecer e falhar no clique. Volta sozinho quando a
   * migration for aplicada, sem precisar de novo deploy.
   */
  const [notesAvailable, setNotesAvailable] = React.useState(false);

  // Respostas rápidas do workspace. Falha silenciosa de propósito: sem elas o
  // botão some e o chat segue normal — não é motivo para quebrar a conversa.
  const listQuickRepliesFn = useServerFn(listQuickReplies);
  const quickRepliesQuery = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => listQuickRepliesFn(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const quickReplyOptions = React.useMemo(
    () =>
      (quickRepliesQuery.data ?? [])
        .filter((q) => q.is_active)
        .map((q) => ({ id: q.id, title: q.title, shortcut: q.shortcut, body: q.body })),
    [quickRepliesQuery.data],
  );

  // Mesma queryKey da sidebar — o React Query deduplica, sem chamada extra.
  const getWorkspaceProfileFn = useServerFn(getWorkspaceProfile);
  const { data: workspaceProfile } = useQuery({
    queryKey: ["workspace-profile"],
    queryFn: () => getWorkspaceProfileFn(),
    staleTime: 5 * 60_000,
  });

  // Membros do workspace para autocomplete de @ em nota. Falha silenciosa
  // (retry:false): sem os membros o Composer só esconde o autocomplete, o
  // resto continua funcionando.
  const listAssignableMembersFn = useServerFn(listAssignableMembers);
  const membersQuery = useQuery({
    queryKey: ["assignable-members"],
    queryFn: () => listAssignableMembersFn(),
    staleTime: 60_000,
    retry: false,
  });
  const mentionCandidates = React.useMemo(
    () =>
      // fetchAssignableMembers já retorna só ativos — sem filtro extra aqui.
      (membersQuery.data ?? []).map((m) => ({
        user_id: m.user_id,
        full_name: m.full_name,
        email: m.email,
      })),
    [membersQuery.data],
  );

  // UserIds que o Composer acumulou no draft de nota atual. Zera junto com
  // o draft quando a nota é enviada.
  const [noteMentions, setNoteMentions] = React.useState<string[]>([]);

  /** Variáveis do template. Nomes em ASCII: renderTemplate usa \w+. */
  const templateVars = React.useMemo(
    () => ({
      cliente: contact?.name?.split(" ")[0] ?? "",
      negocio: (workspaceProfile as any)?.business_name ?? "",
    }),
    [contact?.name, workspaceProfile],
  );
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduleSeed, setScheduleSeed] = React.useState<string[] | undefined>(undefined);
  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [forwardSource, setForwardSource] = React.useState<ForwardSource | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  const actions = useContactActions();
  
  const open = !!contact;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  /** Há página anterior para buscar ao rolar para cima? */
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  /**
   * Trava de reentrância. Precisa ser ref, não o state acima: `setState` é
   * assíncrono, então dois eventos de scroll no mesmo tick leem `false` os
   * dois e disparam a MESMA página duas vezes (mensagens duplicadas).
   */
  const loadingOlderRef = React.useRef(false);
  /**
   * O primeiro posicionamento é um salto seco até o fim; os seguintes são
   * suaves. Sem esta distinção, abrir a conversa anima o scroll do começo ao
   * fim, que é exatamente o "carrega desde o início e depois rola".
   */
  const didInitialScroll = React.useRef(false);

  const openSchedule = (preselected?: string[]) => {
    setScheduleSeed(preselected);
    setScheduleOpen(true);
  };

  // reset on contact change
  React.useEffect(() => {
    if (!contact) return;
    // Precisa ser `initialTab`, não "conversation": este effect roda na montagem
    // com contato e sobrescreveria o estado inicial do useState acima.
    setTab(initialTab);
    setDraft("");
    setNoteDraft("");
    setComposerMode("reply");
    setMenuOpen(false);
    setReplyingTo(null);
    setMessages(import.meta.env.DEV && contact.id.startsWith("c") ? seedMessages(contact) : []);
  }, [contact?.id]);

  // Background: refresh foto do WhatsApp ao abrir o chat (silencioso)
  React.useEffect(() => {
    if (!contact?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await refreshAvatar({ data: { contactId: contact.id } });
        if (!cancelled && r?.changed && r.url) {
          onContactUpdate?.(contact.id, { avatar: r.url });
        }
      } catch {
        // silencioso — Evolution pode não estar configurado
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contact?.id]);

  // load + subscribe to realtime messages reais do Supabase
  React.useEffect(() => {
    if (!contact) return;
    let cancelled = false;
    // Conversa nova: o primeiro posicionamento precisa ser instantâneo de novo.
    didInitialScroll.current = false;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setHasMore(false);

    (async () => {
      // Só a última página. Antes buscava o histórico INTEIRO: um contato com
      // centenas de mensagens renderizava tudo de uma vez, e a conversa
      // demorava a abrir enquanto o scroll desfilava do começo até o fim.
      const rows = await fetchMessagePage(contact.id, null, (v) => {
        if (!cancelled) setNotesAvailable(v);
      });
      if (cancelled || !rows) return;
      setHasMore(rows.length === MESSAGE_PAGE_SIZE);
      // Vem do mais novo para o mais antigo (é assim que se pega "as últimas");
      // a lista renderiza em ordem cronológica.
      setMessages(rows.slice().reverse());
    })();

    const channel = supabase
      .channel(`messages:${contact.id}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        (payload: any) => {
          const r = payload.new;
          setMessages((prev) =>
            prev.some((m) => m.id === r.id)
              ? prev
              : [
                  ...prev,
                  {
                    id: r.id,
                    direction: r.direction,
                    content: r.content,
                    message_type: r.message_type ?? "text",
                    status: r.status ?? "sent",
                    created_at: new Date(r.created_at),
                    media_url: r.media_url ?? null,
                    media_mime: r.media_mime ?? null,
                    media_name: r.media_name ?? null,
                    whatsapp_message_id: r.whatsapp_message_id ?? null,
                    quoted_preview: r.quoted_preview ?? null,
                    reactions: r.reactions ?? [],
                    deleted_at: r.deleted_at ?? null,
                    edited_at: r.edited_at ?? null,
                    is_ai: !!r.is_ai,
                    is_internal: !!r.is_internal,
                  },
                ],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        (payload: any) => {
          const r = payload.new;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === r.id
                ? {
                    ...m,
                    status: r.status ?? m.status,
                    content: r.content ?? m.content,
                    media_url: r.media_url ?? m.media_url,
                    media_mime: r.media_mime ?? m.media_mime,
                    media_name: r.media_name ?? m.media_name,
                    whatsapp_message_id: r.whatsapp_message_id ?? m.whatsapp_message_id,
                    quoted_preview: r.quoted_preview ?? m.quoted_preview,
                    reactions: r.reactions ?? m.reactions,
                    deleted_at: r.deleted_at ?? m.deleted_at,
                    edited_at: r.edited_at ?? m.edited_at,
                  }
                : m,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [contact?.id]);

  // auto scroll to bottom on new message
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    // Abertura: salto seco. Animar aqui faria a conversa inteira desfilar.
    if (!didInitialScroll.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScroll.current = true;
      return;
    }
    // Carregar mensagens antigas prepende no topo — rolar para baixo aqui
    // jogaria o usuário de volta ao fim, desfazendo o que ele pediu.
    if (loadingOlder) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, tab, loadingOlder]);

  /**
   * Página anterior ao chegar perto do topo. Preserva a posição de leitura:
   * sem isso, prepender conteúdo empurra o que está na tela para baixo e o
   * usuário perde o ponto onde estava.
   */
  const loadOlderMessages = React.useCallback(async () => {
    const el = scrollRef.current;
    if (!el || !contact || loadingOlderRef.current || !hasMore || messages.length === 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const heightBefore = el.scrollHeight;
    const topBefore = el.scrollTop;

    const finish = () => {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    };

    const rows = await fetchMessagePage(contact.id, messages[0].created_at, setNotesAvailable);
    if (!rows) {
      finish();
      return;
    }
    setHasMore(rows.length === MESSAGE_PAGE_SIZE);
    if (rows.length === 0) {
      finish();
      return;
    }
    // Dedupe por id: o realtime pode inserir a mesma mensagem em paralelo, e
    // duas cópias do mesmo id quebram a reconciliação do React.
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const older = rows.slice().reverse().filter((m) => !known.has(m.id));
      return older.length > 0 ? [...older, ...prev] : prev;
    });
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight - heightBefore + topBefore;
      finish();
    });
  }, [contact, hasMore, messages]);

  const buildQuoted = (m: Message | null) => {
    if (!m || !m.whatsapp_message_id) return undefined;
    // Canais Zernio (Instagram/WhatsApp Cloud) não têm phone obrigatório nem
    // remoteJid — o envio via Zernio usa apenas o messageId como replyTo.
    // Evolution precisa de phone + remoteJid pra montar a citação no Baileys.
    const isZernioChannel =
      contact?.channel === "whatsapp_cloud" || contact?.channel === "instagram";
    if (!isZernioChannel && !contact?.phone) return undefined;
    const number = contact?.phone ? String(contact.phone).replace(/\D/g, "") : "";
    return {
      messageId: m.whatsapp_message_id,
      fromMe: m.direction === "outbound",
      remoteJid: number ? `${number}@s.whatsapp.net` : "",
      preview: {
        content: m.content || m.media_name || "",
        message_type: m.message_type,
      },
    };
  };

  const send = async () => {
    if (!contact) return;

    // Modo nota: grava e sai. Nunca toca na Evolution.
    if (composerMode === "note") {
      const note = noteDraft.trim();
      if (!note) return;
      const ok = await actions.addInternalNote(contact.id, note, noteMentions);
      // Limpa SÓ no sucesso — em erro o texto continua na caixa. Ao contrário
      // de uma mensagem, uma nota perdida não tem como ser recuperada.
      if (ok) {
        setNoteDraft("");
        if (taRef.current) taRef.current.style.height = "auto";
        toast.success("Nota salva — só a equipe vê");
      }
      return;
    }

    const text = draft.trim();
    if (!text) return;
    // Sem optimistic update: o canal realtime é a fonte da verdade.
    // Isso evita duplicação (mensagem aparecendo 2x para o agente).
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);

    try {
      // tenta enviar pelo WhatsApp via Evolution; o handler já grava em messages
      await sendViaEvolution({ data: { contactId: contact.id, text, quoted } });
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      // se Evolution não estiver configurado/conectado, persiste só no banco
      if (/Evolution|conectar|conectado|configurad/i.test(msg)) {
        const { error } = await supabase.from("messages").insert({
          owner_user_id: workspaceOwnerId,
          contact_id: contact.id,
          direction: "outbound",
          content: text,
          message_type: "text",
          status: "sent",
          sent_by: user?.id ?? null,
        });
        if (error) console.warn("[chat] persistência ignorada:", error.message);
        toast.warning("WhatsApp não conectado — mensagem salva localmente.");
      } else {
        toast.error(msg || "Falha ao enviar");
      }
    }
  };

  const handleSendAttachments = async (files: File[], caption: string) => {
    if (!contact) return;
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const { url } = await uploadChatMedia(f, user!.id);
      const cap = i === 0 ? caption : "";
      try {
        await sendMediaFn({
          data: {
            contactId: contact.id,
            url,
            mime: f.type || "application/octet-stream",
            name: f.name || `file-${Date.now()}`,
            caption: cap || undefined,
            quoted: i === 0 ? quoted : undefined,
          },
        });
      } catch (e: any) {
        toast.error(e?.message ?? "Falha no envio.");
      }
    }
  };

  const handleSendAudio = async (blob: Blob) => {
    if (!contact) return;
    // Instagram DM não aceita webm/opus (só aac/m4a/wav/mp4). Convertemos o
    // áudio gravado para WAV no navegador antes de subir. WhatsApp (Cloud e
    // Evolution) aceita opus, então mantém o webm original — mais leve.
    let sendBlob = blob;
    let ext = "webm";
    let mimeType = "audio/webm";
    if (contact.channel === "instagram") {
      try {
        sendBlob = await blobToWav(blob);
        ext = "wav";
        mimeType = "audio/wav";
      } catch (e: any) {
        toast.error("Não foi possível converter o áudio para envio no Instagram.");
        console.error("[audio] conversão WAV falhou:", e?.message ?? e);
        return;
      }
    }
    const file = new File([sendBlob], `audio-${Date.now()}.${ext}`, { type: mimeType });
    const { url } = await uploadChatMedia(file, user!.id);
    const quoted = buildQuoted(replyingTo);
    setReplyingTo(null);
    await sendAudioFn({ data: { contactId: contact.id, url, quoted } });
  };

  const isInline = variant === "inline";

  return (
    <>
      {open && !isInline && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 40,
            animation: "fadeSlideIn 150ms ease-out",
          }}
        />
      )}

      <aside
        style={{
          ...(isInline
            ? {
                position: "relative",
                height: "100%",
                width: "100%",
                minWidth: 0,
              }
            : {
                position: "fixed",
                top: 0,
                right: 0,
                height: "100vh",
                width: 460,
                maxWidth: "100vw",
                borderLeft: "1px solid var(--border)",
                transform: open ? "translateX(0)" : "translateX(100%)",
                transition: "transform 200ms ease-out",
                zIndex: 50,
              }),
          background: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {contact && (
          <>
            {/* Header — identidade, sem ações. 44px cabe o avatar de 36px. */}
            <div
              className="flex items-center"
              style={{
                gap: 10,
                padding: "0 10px",
                height: 44,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
                <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={36} channel={contact.channel} />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 }}
                >
                  {contact.name}
                </div>
                <div
                  className="truncate flex items-center"
                  style={{ fontSize: 12, color: "var(--text-muted)", gap: 6, marginTop: 2 }}
                >
                  <span className="font-mono">{formatPhone(contact.phone)}</span>
                </div>
              </div>
              {headerExtra}
            </div>

            {/* Abas + ações na mesma linha — antes eram duas fileiras (identidade
                com os botões, e as abas embaixo); juntar libera uma fileira
                inteira para o chat. */}
            <div
              className="flex items-center justify-between"
              style={{
                borderBottom: "1px solid var(--border)",
                padding: "0 6px 0 8px",
                background: "var(--bg-overlay)",
                height: 40,
                position: "relative",
              }}
            >
              <div className="flex items-center" style={{ height: "100%" }}>
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: "0 12px",
                      height: 40,
                      fontSize: 12,
                      fontWeight: 500,
                      background: "transparent",
                      color: tab === t.id ? "var(--brand-400)" : "var(--text-muted)",
                      borderBottom:
                        tab === t.id
                          ? "2px solid var(--brand-400)"
                          : "2px solid transparent",
                      marginBottom: -1,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    <t.Icon size={13} aria-hidden />
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center" style={{ gap: 6, flexShrink: 0 }}>
                <HeaderButton onClick={() => setTransferOpen(true)}>
                  Transferir
                </HeaderButton>
                <HeaderButton primary onClick={() => openSchedule()}>
                  <span className="inline-flex items-center" style={{ gap: 4 }}>
                    <CalendarPlus size={13} /> Agendar
                  </span>
                </HeaderButton>
                <IconBtn label="Mais ações" onClick={() => setMenuOpen((v) => !v)}>
                  <MoreVertical size={15} />
                </IconBtn>
                <IconBtn label="Fechar" onClick={onClose}>
                  <X size={15} />
                </IconBtn>
              </div>

              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 38,
                    right: 6,
                    width: 220,
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-card)",
                    boxShadow: "0 10px 28px rgba(0,0,0,0.18)",
                    padding: 4,
                    zIndex: 60,
                    animation: "fadeSlideIn 150ms ease-out",
                  }}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <MenuItem icon={<UserPlus size={14} />} onClick={() => { setMenuOpen(false); setTransferOpen(true); }}>
                    Transferir para agente
                  </MenuItem>
                  <MenuItem
                    icon={<AlertOctagon size={14} style={{ color: contact.priority === "urgent" ? "var(--text-muted)" : "#EF4444" }} />}
                    onClick={() => { setMenuOpen(false); void actions.toggleUrgent(contact.id, contact.priority); }}
                  >
                    {contact.priority === "urgent" ? "Remover urgência" : "Marcar como urgente"}
                  </MenuItem>
                  <MenuItem icon={<Tag size={14} />} onClick={() => { setMenuOpen(false); setTab("contact"); }}>
                    Adicionar tag
                  </MenuItem>
                  <MenuItem icon={<CalendarPlus size={14} />} onClick={() => { setMenuOpen(false); openSchedule(); }}>
                    Agendar atendimento
                  </MenuItem>
                  <MenuItem
                    icon={<CheckCheck size={14} style={{ color: "#64748B" }} />}
                    onClick={() => { setMenuOpen(false); void actions.moveToColumn(contact.id, "resolved"); }}
                    disabled={contact.kanban_column === "resolved"}
                  >
                    Resolver conversa
                  </MenuItem>
                  <MenuItem
                    icon={<Ban size={14} style={{ color: "#EF4444" }} />}
                    onClick={() => {
                      setMenuOpen(false);
                      const blocked = !!contact.is_blocked;
                      if (confirm(`${blocked ? "Desbloquear" : "Bloquear"} ${contact.name}?`)) {
                        void actions.toggleBlock(contact.id, blocked);
                      }
                    }}
                  >
                    {contact.is_blocked ? "Desbloquear contato" : "Bloquear contato"}
                  </MenuItem>
                  <MenuItem icon={<ExternalLink size={14} />} onClick={() => { setMenuOpen(false); setTab("contact"); }}>
                    Ver perfil completo
                  </MenuItem>
                </div>
              )}
            </div>

            {/* Body */}
            {tab === "conversation" ? (
              <>
                <div
                  ref={scrollRef}
                  className="flex-1 overflow-y-auto"
                  style={{ padding: 16, background: "var(--bg-base)" }}
                  onScroll={(e) => {
                    if (e.currentTarget.scrollTop < 120) void loadOlderMessages();
                  }}
                >
                  {hasMore && (
                    <div
                      className="flex items-center justify-center"
                      style={{ padding: "4px 0 12px", fontSize: 12, color: "var(--text-muted)" }}
                    >
                      {loadingOlder ? "Carregando mensagens anteriores…" : "Role para ver mais"}
                    </div>
                  )}
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    {messages.map((m, i) => {
                      const prev = i > 0 ? messages[i - 1] : null;
                      const showSep = !prev || !sameDay(prev.created_at, m.created_at);
                      return (
                        <React.Fragment key={m.id}>
                          {showSep && <DateSeparator date={m.created_at} />}
                          <MessageBubble
                            m={m}
                        displayStatus={getVisualMessageStatus(m)}
                        contactName={contact.name}
                        contactAvatar={contact.avatar}
                        channel={contact.channel}
                        onReply={(msg) => {
                          setReplyingTo(msg);
                          setTimeout(() => taRef.current?.focus(), 0);
                        }}
                        onReact={async (msg, emoji) => {
                          // optimistic update
                          setMessages((prev) =>
                            prev.map((x) =>
                              x.id === msg.id
                                ? {
                                    ...x,
                                    reactions: [
                                      ...((x.reactions ?? []).filter((r) => r.from !== "me")),
                                      { emoji, from: "me" },
                                    ],
                                  }
                                : x,
                            ),
                          );
                          try {
                            await reactFn({ data: { messageId: msg.id, reaction: emoji } });
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao reagir");
                          }
                        }}
                        editing={editingId === m.id}
                        onStartEdit={() => setEditingId(m.id)}
                        onCancelEdit={() => setEditingId(null)}
                        onSaveEdit={async (text) => {
                          const trimmed = text.trim();
                          if (!trimmed) return;
                          const prevContent = m.content;
                          setMessages((prev) =>
                            prev.map((x) =>
                              x.id === m.id ? { ...x, content: trimmed, edited_at: new Date().toISOString() } : x,
                            ),
                          );
                          setEditingId(null);
                          try {
                            await editFn({ data: { messageId: m.id, text: trimmed } });
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao editar");
                            setMessages((prev) =>
                              prev.map((x) => (x.id === m.id ? { ...x, content: prevContent } : x)),
                            );
                          }
                        }}
                        onDelete={async () => {
                          // Nota interna nunca foi ao WhatsApp: apagar é DELETE
                          // no banco (policy "messages internal note delete"),
                          // não "apagar para todos" via Evolution — que nem
                          // aceitaria, por não haver whatsapp_message_id.
                          if (m.is_internal) {
                            if (!confirm("Apagar esta nota interna?")) return;
                            const { error } = await supabase
                              .from("messages")
                              .delete()
                              .eq("id", m.id);
                            if (error) {
                              toast.error(error.message ?? "Falha ao apagar a nota");
                              return;
                            }
                            setMessages((prev) => prev.filter((x) => x.id !== m.id));
                            return;
                          }
                          if (!confirm("Apagar esta mensagem para todos?")) return;
                          try {
                            await deleteFn({ data: { messageId: m.id } });
                            setMessages((prev) =>
                              prev.map((x) =>
                                x.id === m.id ? { ...x, deleted_at: new Date().toISOString() } : x,
                              ),
                            );
                          } catch (e: any) {
                            toast.error(e?.message ?? "Falha ao apagar");
                          }
                        }}
                        onForward={(msg) =>
                          setForwardSource({
                            id: msg.id,
                            content: msg.content ?? "",
                            message_type: msg.message_type,
                            media_url: msg.media_url ?? null,
                            media_mime: msg.media_mime ?? null,
                            media_name: msg.media_name ?? null,
                            is_internal: !!msg.is_internal,
                          })
                        }
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>

                {/* Composer */}
                <Composer
                  draft={composerMode === "note" ? noteDraft : draft}
                  setDraft={composerMode === "note" ? setNoteDraft : setDraft}
                  mode={composerMode}
                  // Sem a coluna no banco, o Composer não renderiza o toggle.
                  onModeChange={notesAvailable ? setComposerMode : undefined}
                  quickReplies={quickReplyOptions}
                  templateVars={templateVars}
                  templatesEnabled={contact.channel === "whatsapp_cloud"}
                  onOpenTemplates={() => setTemplatesOpen(true)}
                  mentionCandidates={mentionCandidates}
                  onMentionsChange={setNoteMentions}
                  taRef={taRef}
                  onSend={send}
                  onClosePanel={onClose}
                  onSendAttachments={handleSendAttachments}
                  onSendAudio={handleSendAudio}
                  replyingTo={
                    replyingTo
                      ? {
                          author: replyingTo.direction === "outbound" ? "Você" : contact.name,
                          content: replyingTo.content || replyingTo.media_name || "Mídia",
                          isMe: replyingTo.direction === "outbound",
                        }
                      : null
                  }
                  onCancelReply={() => setReplyingTo(null)}
                />
              </>
            ) : (
              <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
                {tab === "contact" && <ContactForm contact={contact} compact />}
                {tab === "services" && (
                  <ServicesTab onSchedule={(ids) => openSchedule(ids)} />
                )}
                {tab === "history" && <HistoryTab contactId={contact.id} />}
              </div>
            )}
          </>
        )}
      </aside>

      {contact && (
        <ScheduleModal
          contact={contact}
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          preselectedServiceIds={scheduleSeed}
          onScheduled={() => {
            onContactUpdate?.(contact.id, { kanban_column: "scheduled" });
          }}
        />
      )}
      <ForwardModal
        open={!!forwardSource}
        source={forwardSource}
        excludeContactId={contact?.id}
        onClose={() => setForwardSource(null)}
      />
      <TransferConversationModal
        open={transferOpen}
        contactId={contact?.id ?? null}
        contactName={contact?.name ?? null}
        currentAssignedAgentId={contact?.assignedAgent ?? null}
        onClose={() => setTransferOpen(false)}
        onAssigned={(agentUserId) => {
          if (contact) {
            onContactUpdate?.(contact.id, { assignedAgent: agentUserId });
          }
        }}
      />
      <TemplatePickerModal
        open={templatesOpen}
        contactId={contact?.id ?? null}
        onClose={() => setTemplatesOpen(false)}
      />
    </>
  );
}

/* ---------------- subcomponents ---------------- */

function MessageBubble({
  m,
  displayStatus,
  contactName,
  contactAvatar,
  channel,
  onReply,
  onReact,
  editing,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onForward,
}: {
  m: Message;
  displayStatus: Message["status"];
  contactName: string;
  contactAvatar?: string | null;
  channel?: "whatsapp_evolution" | "whatsapp_cloud" | "instagram" | null;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
  editing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  onDelete?: () => void;
  onForward?: (m: Message) => void;
}) {
  // Nota interna ANTES do branch de "system": a nota também é message_type
  // "system" (para falhar seguro em quem não conhece is_internal), então se a
  // ordem invertesse ela renderizaria como aviso genérico do sistema.
  // Não é alinhada à esquerda nem à direita de propósito — não é um lado da
  // conversa, é anotação sobre ela.
  if (m.is_internal) {
    return (
      <div
        style={{
          alignSelf: "stretch",
          width: "100%",
          background: "color-mix(in oklab, #F59E0B 10%, var(--bg-surface))",
          border: "1px solid color-mix(in oklab, #F59E0B 45%, transparent)",
          borderLeft: "3px solid #F59E0B",
          borderRadius: "var(--radius-card)",
          padding: "8px 11px",
          margin: "2px 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: "#B45309",
            marginBottom: 3,
          }}
        >
          <StickyNote size={11} aria-hidden />
          Nota interna
          <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
            · {m.created_at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div style={{ fontSize: 13.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {m.content}
        </div>
      </div>
    );
  }

  if (m.message_type === "system") {
    return (
      <div
        style={{
          alignSelf: "center",
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "center",
          padding: "6px 0",
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        <span>{m.content}</span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
    );
  }

  const isMe = m.direction === "outbound";

  // ===== Deleted message =====
  if (m.deleted_at) {
    const delBg = isMe
      ? "color-mix(in oklab, var(--brand-400) 8%, var(--bg-surface))"
      : "var(--bg-overlay)";
    return (
      <div
        style={{
          alignSelf: isMe ? "flex-end" : "flex-start",
          maxWidth: "75%",
          background: delBg,
          border: "1px dashed var(--border)",
          borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
          padding: "8px 11px",
          fontSize: 13,
          fontStyle: "italic",
          color: "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Trash2 size={13} />
        <span>Esta mensagem foi apagada</span>
        <span style={{ marginLeft: 6, fontSize: 11 }}>{fmtClock(m.created_at)}</span>
      </div>
    );
  }

  // ===== Audio: WhatsApp-like player as the bubble itself =====
  if (m.message_type === "audio" && m.media_url) {
    const audioBg = isMe
      ? "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"
      : "var(--bg-overlay)";
    return (
      <div
        className="group/msg relative"
        style={{
          alignSelf: isMe ? "flex-end" : "flex-start",
          maxWidth: "85%",
          background: audioBg,
          border: isMe
            ? "1px solid color-mix(in oklab, var(--brand-400) 30%, transparent)"
            : "1px solid var(--border)",
          borderRadius: isMe ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          padding: "6px 10px 4px",
          animation: "fadeSlideIn 200ms ease-out",
        }}
      >
        <MessageChevron isMe={isMe} bubbleBg={audioBg} message={m} channel={channel} onReply={onReply} onReact={onReact} onDelete={onDelete} onForward={onForward} />
        {m.quoted_preview && <QuotedPreview preview={m.quoted_preview} isMe={isMe} />}
        {m.is_ai && isMe && (
          <div className="inline-flex items-center" style={{ gap: 4, fontSize: 10, fontWeight: 600, background: "color-mix(in oklab, var(--brand-400) 20%, transparent)", color: "var(--brand-400)", padding: "1px 6px", borderRadius: "var(--radius-pill)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <Bot size={10} /> IA
          </div>
        )}
        <AudioPlayerWithMe
          src={m.media_url}
          contactName={contactName}
          contactAvatar={contactAvatar ?? null}
          isMe={isMe}
        />
        <div
          style={{
            marginTop: 2,
            fontSize: 11,
            color: "var(--text-muted)",
            textAlign: "right",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            float: "right",
          }}
        >
          {fmtClock(m.created_at)}
          {isMe && <StatusTicks status={displayStatus} />}
        </div>
        <div style={{ clear: "both" }} />
        <ReactionsRow reactions={m.reactions} isMe={isMe} />
      </div>
    );
  }

  const bubbleBg = isMe
    ? "color-mix(in oklab, var(--brand-400) 15%, var(--bg-surface))"
    : "var(--bg-overlay)";
  return (
    <div
      className="group/msg relative"
      style={{
        alignSelf: isMe ? "flex-end" : "flex-start",
        maxWidth: "75%",
        background: bubbleBg,
        border: isMe
          ? "1px solid color-mix(in oklab, var(--brand-400) 30%, transparent)"
          : "1px solid var(--border)",
        borderRadius: isMe ? "12px 2px 12px 12px" : "2px 12px 12px 12px",
        padding: "8px 11px",
        fontSize: 14,
        lineHeight: 1.4,
        color: "var(--text-primary)",
        animation: "fadeSlideIn 200ms ease-out",
        wordBreak: "break-word",
      }}
    >
      <MessageChevron isMe={isMe} bubbleBg={bubbleBg} message={m} channel={channel} onReply={onReply} onReact={onReact} onEdit={onStartEdit} onDelete={onDelete} onForward={onForward} />
      {m.quoted_preview && <QuotedPreview preview={m.quoted_preview} isMe={isMe} />}
      {m.is_ai && isMe && (
        <div className="inline-flex items-center" style={{ gap: 4, fontSize: 10, fontWeight: 600, background: "color-mix(in oklab, var(--brand-400) 20%, transparent)", color: "var(--brand-400)", padding: "1px 6px", borderRadius: "var(--radius-pill)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <Bot size={10} /> IA
        </div>
      )}
      {m.media_url && m.message_type === "image" && (
        <a href={m.media_url} target="_blank" rel="noreferrer" style={{ display: "block", marginBottom: m.content ? 6 : 0 }}>
          <img
            src={m.media_url}
            alt={m.media_name ?? "imagem"}
            style={{ display: "block", maxWidth: 260, maxHeight: 320, width: "100%", borderRadius: "var(--radius-card)", objectFit: "cover" }}
          />
        </a>
      )}
      {m.media_url && m.message_type === "video" && (
        <video
          controls
          src={m.media_url}
          style={{ display: "block", maxWidth: 260, width: "100%", borderRadius: "var(--radius-card)", marginBottom: m.content ? 6 : 0 }}
        />
      )}
      {m.media_url && m.message_type === "document" && (
        <a
          href={m.media_url}
          target="_blank"
          rel="noreferrer"
          download={m.media_name ?? undefined}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: "var(--radius-card)",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)", textDecoration: "none",
            marginBottom: m.content ? 6 : 0, maxWidth: 240,
          }}
        >
          <FileText size={18} style={{ flexShrink: 0, color: "var(--brand-400)" }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.media_name ?? "Documento"}
          </span>
          <Download size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
        </a>
      )}
      {editing ? (
        <InlineEditor
          initial={m.content}
          onCancel={() => onCancelEdit?.()}
          onSave={(t) => onSaveEdit?.(t)}
        />
      ) : (
        m.content && <div>{m.content}</div>
      )}
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: "var(--text-muted)",
          textAlign: "right",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          float: "right",
          marginLeft: 8,
        }}
      >
        {m.edited_at && <span style={{ fontStyle: "italic" }}>editada</span>}
        {fmtClock(m.created_at)}
        {isMe && <StatusTicks status={displayStatus} />}
      </div>
      <div style={{ clear: "both" }} />
      <ReactionsRow reactions={m.reactions} isMe={isMe} />
    </div>
  );
}

function getVisualMessageStatus(message: Message): Message["status"] {
  return message.status;
}

function fmtClock(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function ReactionsRow({
  reactions,
  isMe,
}: {
  reactions?: Array<{ emoji: string; from: string }> | null;
  isMe: boolean;
}) {
  if (!reactions || reactions.length === 0) return null;
  const counts = reactions.reduce<Record<string, number>>((acc, r) => {
    if (!r?.emoji) return acc;
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginTop: 2,
        marginBottom: -10,
        justifyContent: isMe ? "flex-end" : "flex-start",
        position: "relative",
        zIndex: 1,
      }}
    >
      {entries.map(([emoji, count]) => (
        <span
          key={emoji}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "1px 6px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            fontSize: 12,
            lineHeight: 1.4,
            boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}
        >
          <span style={{ fontSize: 13 }}>{emoji}</span>
          {count > 1 && <span style={{ color: "var(--text-muted)" }}>{count}</span>}
        </span>
      ))}
    </div>
  );
}

function QuotedPreview({
  preview,
  isMe,
}: {
  preview: { content?: string; author?: string; message_type?: string };
  isMe: boolean;
}) {
  const accent = isMe ? "var(--brand-400)" : "#9aa3af";
  const previewKind =
    preview.message_type === "image" ||
    preview.message_type === "video" ||
    preview.message_type === "audio" ||
    preview.message_type === "document"
      ? (preview.message_type as MediaKind)
      : null;
  const TypeIcon = previewKind ? mediaTypeIcon(previewKind) : null;
  const typeLabel = previewKind ? mediaKindLabel(previewKind) : null;
  return (
    <div
      style={{
        display: "block",
        padding: "6px 8px",
        marginBottom: 6,
        background: "color-mix(in oklab, var(--text-primary) 6%, transparent)",
        borderRadius: "var(--radius-control)",
        borderLeft: `3px solid ${accent}`,
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: accent, marginBottom: 2 }}>
        {preview.author || (isMe ? "Você" : "")}
      </div>
      <div
        className="flex items-center"
        style={{
          gap: 4,
          color: "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {TypeIcon && <TypeIcon size={12} style={{ flexShrink: 0 }} />}
        <span className="truncate">{typeLabel || preview.content || ""}</span>
      </div>
    </div>
  );
}

function MessageChevron({
  isMe,
  bubbleBg,
  message,
  channel,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onForward,
}: {
  isMe: boolean;
  bubbleBg: string;
  message: Message;
  channel?: "whatsapp_evolution" | "whatsapp_cloud" | "instagram" | null;
  onReply?: (m: Message) => void;
  onReact?: (m: Message, emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onForward?: (m: Message) => void;
}) {
  return (
    <MessageActions
      bubbleBg={bubbleBg}
      channel={channel}
      message={{
        id: message.id,
        isMe,
        content: message.content ?? "",
        mediaUrl: message.media_url ?? null,
        mediaName: message.media_name ?? null,
        messageType: message.message_type,
        isInternal: !!message.is_internal,
      }}
      onReply={() => onReply?.(message)}
      onReact={(_m, emoji) => onReact?.(message, emoji)}
      onEdit={() => onEdit?.()}
      onDelete={() => onDelete?.()}
      onForward={() => onForward?.(message)}
    />
  );
}

function InlineEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (text: string) => void;
}) {
  const [val, setVal] = React.useState(initial);
  const ref = React.useRef<HTMLTextAreaElement | null>(null);
  React.useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(val.length, val.length);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <textarea
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (val.trim()) onSave(val);
          }
        }}
        rows={Math.min(6, Math.max(1, val.split("\n").length))}
        style={{
          width: "100%",
          background: "var(--bg-base)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-control)",
          color: "var(--text-primary)",
          padding: "6px 8px",
          fontSize: 14,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "4px 12px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => val.trim() && onSave(val)}
          disabled={!val.trim()}
          style={{
            padding: "4px 12px",
            background: "var(--brand-400)",
            border: "1px solid var(--brand-400)",
            borderRadius: "var(--radius-pill)",
            color: "white",
            cursor: val.trim() ? "pointer" : "not-allowed",
            fontSize: 12,
            opacity: val.trim() ? 1 : 0.6,
          }}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function StatusTicks({ status }: { status: Message["status"] }) {
  if (status === "sent") {
    return <Check size={13} color="var(--text-muted)" />;
  }
  const color = status === "read" ? "#34B7F1" : "var(--text-muted)";
  return <CheckCheck size={13} color={color} />;
}

// AudioPlayer extracted to @/components/chat/AudioPlayer for reuse in chat mode.


function HeaderButton({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 12px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        fontWeight: 500,
        background: primary ? "var(--brand-400)" : "transparent",
        color: primary ? "#fff" : "var(--text-primary)",
        border: primary ? "none" : "1px solid var(--border-strong)",
        transition: "background 150ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = primary
          ? "var(--brand-600)"
          : "var(--bg-overlay)";
      }}
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = primary ? "var(--brand-400)" : "transparent")
      }
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: 30,
        height: 30,
        borderRadius: "var(--radius-pill)",
        background: "transparent",
        color: "var(--text-muted)",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center w-full"
      style={{
        gap: 8,
        padding: "8px 10px",
        fontSize: 13,
        color: "var(--text-primary)",
        background: "transparent",
        borderRadius: "var(--radius-control)",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      {children}
    </button>
  );
}

function ServicesTab({ onSchedule }: { onSchedule: (serviceIds: string[]) => void }) {
  const { workspaceOwnerId } = useWorkspaceOwnerId();
  const [catalog, setCatalog] = React.useState<Service[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    if (!workspaceOwnerId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id,name,description,price_cents,duration_minutes,buffer_minutes,color,status,created_at",
        )
        .eq("owner_user_id", workspaceOwnerId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn("[conversation-panel] erro ao carregar serviços:", error.message);
        setLoaded(true);
        return;
      }
      setCatalog(
        (data ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          price_cents: s.price_cents ?? 0,
          duration_minutes: s.duration_minutes ?? 30,
          buffer_minutes: s.buffer_minutes ?? 0,
          color: s.color ?? "#25C880",
          status: (s.status ?? "active") as ServiceStatus,
          created_at: s.created_at ? new Date(s.created_at) : new Date(),
          price_disclosure_policy: null,
          photo_send_policy: null,
          photos: [],
        })),
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceOwnerId]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const sel = catalog.filter((s) => selected.has(s.id));
  const totalCents = sel.reduce((a, s) => a + s.price_cents, 0);
  const totalMin = sel.reduce((a, s) => a + s.duration_minutes, 0);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col" style={{ gap: 8, paddingBottom: 80 }}>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
        Marque os serviços de interesse do cliente. Eles serão pré-selecionados ao agendar.
      </p>
      {loaded && catalog.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Nenhum serviço ativo cadastrado. Cadastre em Serviços no menu lateral.
        </p>
      )}
      {catalog.map((s) => {
        const on = selected.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className="flex items-center w-full"
            style={{
              gap: 10,
              padding: "10px 12px",
              borderRadius: "var(--radius-card)",
              border: on
                ? "1px solid color-mix(in oklab, var(--brand-400) 60%, transparent)"
                : "1px solid var(--border)",
              background: on
                ? "color-mix(in oklab, var(--brand-400) 10%, var(--bg-surface))"
                : "var(--bg-surface)",
              textAlign: "left",
              transition: "all 150ms ease",
            }}
          >
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 18,
                height: 18,
                borderRadius: "var(--radius-sm)",
                border: "1.5px solid",
                borderColor: on ? "var(--brand-400)" : "var(--border-strong)",
                background: on ? "var(--brand-400)" : "transparent",
                color: "#fff",
              }}
            >
              {on && <Check size={12} />}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {s.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {formatDuration(s.duration_minutes)}
              </div>
            </div>
            <div className="font-mono" style={{ fontSize: 13, color: "var(--text-primary)" }}>
              {formatCurrencyBRL(s.price_cents)}
            </div>
          </button>
        );
      })}

      {/* Sticky footer */}
      <div
        style={{
          position: "sticky",
          bottom: -16,
          marginTop: 8,
          marginInline: -16,
          marginBottom: -16,
          padding: 12,
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div className="flex-1">
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {sel.length} selecionado{sel.length === 1 ? "" : "s"} · {formatDuration(totalMin)}
          </div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            {formatCurrencyBRL(totalCents)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSchedule(sel.map((s) => s.id))}
          disabled={sel.length === 0}
          className="inline-flex items-center"
          style={{
            gap: 6,
            height: 34,
            padding: "0 16px",
            borderRadius: "var(--radius-pill)",
            background: "var(--brand-400)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            opacity: sel.length === 0 ? 0.5 : 1,
            cursor: sel.length === 0 ? "not-allowed" : "pointer",
          }}
        >
          <CalendarPlus size={14} /> Agendar serviços selecionados
        </button>
      </div>
    </div>
  );
}

interface HistoryEvent {
  id: string;
  kind: "created" | "rescheduled" | "cancelled";
  created_at: Date;
  starts_at: Date | null;
  previous_starts_at: Date | null;
  service_name: string | null;
}

const EVENT_LABEL: Record<HistoryEvent["kind"], { label: string; color: string }> = {
  created: { label: "Agendado", color: "#3B82F6" },
  rescheduled: { label: "Reagendado", color: "#F59E0B" },
  cancelled: { label: "Cancelado", color: "#EF4444" },
};

function fmtDT(d: Date) {
  const dt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const tm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dt} · ${tm}`;
}

function HistoryTab({ contactId }: { contactId: string }) {
  const [items, setItems] = React.useState<HistoryEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("appointment_events")
        .select("id,kind,created_at,starts_at,previous_starts_at,services(name)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error || !data) {
        setItems([]);
      } else {
        setItems(
          data.map((r: any) => ({
            id: r.id,
            kind: r.kind,
            created_at: new Date(r.created_at),
            starts_at: r.starts_at ? new Date(r.starts_at) : null,
            previous_starts_at: r.previous_starts_at ? new Date(r.previous_starts_at) : null,
            service_name: r.services?.name ?? null,
          })),
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (loading) {
    return <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12 }}>Carregando…</div>;
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          padding: 16,
          textAlign: "center",
          border: "1px dashed var(--border)",
          borderRadius: "var(--radius-card)",
        }}
      >
        Nenhum histórico para este contato.
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      {items.map((it) => {
        const meta = EVENT_LABEL[it.kind];
        return (
          <div
            key={it.id}
            style={{
              padding: 10,
              borderRadius: "var(--radius-card)",
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
            }}
          >
            <div className="flex items-center justify-between" style={{ gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {fmtDT(it.created_at)}
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${meta.color}`,
                  color: meta.color,
                }}
              >
                {meta.label}
              </span>
            </div>
            {it.kind === "rescheduled" && it.previous_starts_at && it.starts_at && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                {fmtDT(it.previous_starts_at)} → {fmtDT(it.starts_at)}
              </div>
            )}
            {it.kind !== "rescheduled" && it.starts_at && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Horário: {fmtDT(it.starts_at)}
              </div>
            )}
            {it.service_name && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                Serviço: {it.service_name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
