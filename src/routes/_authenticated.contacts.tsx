import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, Plus, Users, MessageSquare, AlertTriangle, Database, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toCsv, downloadCsv, csvTimestamp, type CsvColumn } from "@/lib/csv-export";
import { notify } from "@/lib/notify";
import {
  MOCK_CONTACTS,
  formatRelative,
  formatPhone,
  type ContactCard,
} from "@/features/inbox/data";
import {
  CONTACT_COLUMNS,
  CONTACT_COLUMNS_LEGACY,
  hasRegistration,
  isMissingColumnError,
  mapContactRow,
} from "@/features/inbox/contact-row";
import { ConversationPanel } from "@/features/inbox/conversation-panel";
import { ContactAvatar } from "@/features/inbox/contact-avatar";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { SkeletonCard } from "@/components/skeleton";
import { Card } from "@/components/ui/card";
import { NewContactModal } from "@/features/inbox/new-contact-modal";

/**
 * Tela de CLIENTES — o CRM, não uma terceira caixa de entrada.
 *
 * Mostra só contato com cadastro (`hasRegistration`): quem chegou pelo WhatsApp
 * e ainda não tem ficha preenchida vive em Conversas e no Kanban, que é onde
 * atendimento pertence. Por isso aqui não há coluna de kanban, última mensagem
 * nem marcador de não-lido — os três faziam a tela virar cópia do atendimento.
 *
 * A rota segue `/contacts` de propósito: renomear quebraria links salvos.
 */
export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Clientes | ZapFlow" },
      { name: "description", content: "Clientes cadastrados do seu CRM." },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = React.useState<ContactCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  /** Banco sem as colunas de CRM — sem elas ninguém tem cadastro e a lista fica
   *  permanentemente vazia. Precisa ser dito na tela, não virar mistério. */
  const [legacySchema, setLegacySchema] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [openContact, setOpenContact] = React.useState<ContactCard | null>(null);
  const [newContactOpen, setNewContactOpen] = React.useState(false);

  // Debounce 300ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Hydrate from Supabase, fallback to mocks
  React.useEffect(() => {
    let cancelled = false;
    const mapRow = mapContactRow;

    (async () => {
      let { data, error } = await supabase
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .order("last_message_at", { ascending: false });
      if (isMissingColumnError(error)) {
        const r = await supabase
          .from("contacts")
          .select(CONTACT_COLUMNS_LEGACY)
          .order("last_message_at", { ascending: false });
        data = r.data as any;
        error = r.error;
        if (!cancelled) setLegacySchema(true);
      }
      if (cancelled) return;
      // Erro e lista vazia são coisas diferentes: workspace legitimamente sem
      // cliente precisa ver o empty state, não dados de mock. E mock só em DEV.
      if (error) {
        console.warn("[clientes] erro ao carregar contatos:", error.message);
        setLoadError(error.message);
        if (import.meta.env.DEV) setContacts(MOCK_CONTACTS);
      } else {
        setLoadError(null);
        setContacts((data ?? []).map(mapRow));
      }
      setLoading(false);
    })();

    // Sync local quando useContactActions emite mudanças
    const onContactUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; patch: any }>).detail;
      if (!detail?.id) return;
      const { id, patch } = detail;
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      setOpenContact((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
    };
    window.addEventListener("zf:contact-updated", onContactUpdated as EventListener);

    // Realtime: mudanças vindas de outras abas/dispositivos.
    // Só UPDATE, e para esta tela isso basta por construção: contato recém
    // inserido nunca tem campo de CRM (não entraria na lista de clientes), e
    // UPDATE é justamente o evento que faz um contato entrar/sair dela.
    const channel = supabase
      .channel("contacts-page-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contacts" },
        (payload) => {
          const raw = payload.new as any;
          if (!raw || typeof raw.phone !== "string") return; // payload parcial sem replica identity full
          const row = mapRow(raw);
          setContacts((prev) => prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)));
          setOpenContact((cur) => (cur && cur.id === row.id ? { ...cur, ...row } : cur));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener("zf:contact-updated", onContactUpdated as EventListener);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Cmd+K → "Novo contato"
  React.useEffect(() => {
    const onNew = () => setNewContactOpen(true);
    window.addEventListener("zf:new-contact", onNew);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      onNew();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("zf:new-contact", onNew);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  /**
   * Clientes = contatos com cadastro. Derivado, nunca filtrado na origem:
   * `contacts` tem que seguir cru e completo porque a branch de duplicata do
   * NewContactModal procura nele um contato SEM cadastro. Filtrar antes faria o
   * modal abrir o objeto parcial e o ContactForm salvar null por cima de dado
   * real — o bug que o comentário do onCreated abaixo documenta.
   */
  const clients = React.useMemo(() => contacts.filter(hasRegistration), [contacts]);

  const allTags = React.useMemo(() => {
    const s = new Set<string>();
    clients.forEach((c) => c.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [clients]);

  const filtered = React.useMemo(() => {
    return clients.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (debouncedQuery) {
        const q = debouncedQuery;
        // Busca de CRM: identidade e localização, não conteúdo de conversa.
        // Telefone também pelos dígitos, senão "11998761122" não acha
        // "+55 11 99876-1122".
        const haystack = [
          c.name,
          c.phone,
          c.phone.replace(/\D/g, ""),
          c.email ?? "",
          c.city ?? "",
          c.document_number ?? "",
        ];
        if (!haystack.some((h) => h.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [clients, tagFilter, debouncedQuery]);

  const isFiltering = !!tagFilter || !!debouncedQuery;

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between" style={{ gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
            Clientes
          </h1>
          <p style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
            {loading
              ? "Carregando…"
              : isFiltering
                ? `${filtered.length} de ${clients.length} cliente${clients.length === 1 ? "" : "s"}`
                : `${clients.length} cliente${clients.length === 1 ? "" : "s"}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
          <div
            className="flex items-center"
            style={{
              gap: 6,
              height: 32,
              padding: "0 10px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-surface)",
              minWidth: 240,
            }}
          >
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, telefone, e-mail ou cidade…"
              aria-label="Buscar clientes"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "var(--text-primary)",
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              // Exporta exatamente o que está na tela agora: se o usuário
              // filtrou por tag ou busca, o CSV segue esse recorte. Menos
              // "por que apareceu esse contato aqui?" depois.
              if (filtered.length === 0) {
                notify.info("Nada para exportar com este filtro.");
                return;
              }
              const cols: CsvColumn<ContactCard>[] = [
                { header: "Nome", value: (c) => c.name },
                { header: "Telefone", value: (c) => formatPhone(c.phone) },
                { header: "E-mail", value: (c) => c.email ?? "" },
                {
                  header: "Documento",
                  value: (c) => c.document_number ?? "",
                },
                {
                  header: "Nascimento",
                  value: (c) => c.birth_date ?? "",
                },
                {
                  header: "Endereço",
                  value: (c) =>
                    [
                      c.street,
                      c.address_number,
                      c.address_complement,
                      c.neighborhood,
                      c.city,
                      c.state_uf,
                      c.cep,
                    ]
                      .filter(Boolean)
                      .join(", "),
                },
                { header: "Tags", value: (c) => (c.tags ?? []).join("; ") },
                { header: "Notas", value: (c) => c.notes ?? "" },
              ];
              const csv = toCsv(filtered, cols);
              downloadCsv(`clientes-${csvTimestamp()}`, csv);
              notify.success(
                `Exportados ${filtered.length} cliente${filtered.length === 1 ? "" : "s"}.`,
              );
            }}
            className="inline-flex items-center"
            title="Exportar clientes filtrados em CSV"
            aria-label="Exportar CSV"
            style={{
              gap: 6,
              height: 32,
              padding: "0 12px",
              borderRadius: "var(--radius-control)",
              border: "1px solid var(--border-strong)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Download size={14} />
            Exportar
          </button>

          <button
            type="button"
            onClick={() => setNewContactOpen(true)}
            className="btn-primary"
          >
            <Plus size={14} />
            Novo Cliente
          </button>
        </div>
      </div>

      {/* Filtros — só etiquetas. Chips de coluna do Kanban saíram: eram o que
          mais fazia esta tela parecer uma terceira caixa de entrada. */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
          {allTags.slice(0, 8).map((t) => (
            <FilterPill
              key={t}
              active={tagFilter === t}
              onClick={() => setTagFilter(tagFilter === t ? null : t)}
            >
              #{t}
            </FilterPill>
          ))}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : loadError ? (
        <SharedEmptyState
          icon={<AlertTriangle size={48} style={{ color: "#EF4444" }} aria-hidden="true" />}
          title="Não foi possível carregar os clientes"
          description={`Supabase retornou: ${loadError}`}
        />
      ) : legacySchema ? (
        <SharedEmptyState
          icon={<Database size={48} style={{ color: "#F59E0B" }} aria-hidden="true" />}
          title="Cadastro de clientes indisponível neste banco"
          description="As colunas de CRM ainda não foram aplicadas. Rode supabase/manual/20260802000000_contact_crm_fields.sql no SQL Editor do Supabase."
        />
      ) : contacts.length === 0 ? (
        <SharedEmptyState
          icon={<Users size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
          title="Você ainda não tem contatos"
          description="Conecte seu WhatsApp para começar a receber conversas — depois preencha a ficha de quem virar cliente."
          action={{
            label: "Conectar WhatsApp",
            onClick: () => (window.location.href = "/settings/whatsapp"),
          }}
        />
      ) : clients.length === 0 ? (
        <SharedEmptyState
          icon={<MessageSquare size={48} style={{ color: "var(--brand-400)" }} aria-hidden="true" />}
          title="Nenhum cliente cadastrado ainda"
          description={`Você tem ${contacts.length} contato${contacts.length === 1 ? "" : "s"} no WhatsApp. Abra uma conversa e preencha a ficha na aba Contato — e-mail, documento ou endereço — para o contato aparecer aqui como cliente.`}
          action={{
            label: "Ir para Conversas",
            onClick: () => navigate({ to: "/inbox" }),
          }}
        />
      ) : filtered.length === 0 ? (
        <SharedEmptyState
          icon={<Search size={48} style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
          title="Nenhum cliente encontrado"
          description="Tente ajustar a busca ou a etiqueta selecionada."
        />
      ) : (
        <ContactTable rows={filtered} onOpen={setOpenContact} />
      )}

      <ConversationPanel
        contact={openContact}
        initialTab="contact"
        onClose={() => setOpenContact(null)}
        onContactUpdate={(id, patch) => {
          setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
          setOpenContact((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur));
        }}
      />

      <NewContactModal
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={(contact, { openExisting } = {}) => {
          setNewContactOpen(false);
          if (openExisting) {
            // Duplicata: o contato já está na lista, e o objeto que o modal devolve
            // vem de um SELECT reduzido (sem campos de CRM). Abrir o da lista, que
            // está completo — abrir o parcial faria o form salvar nulls por cima.
            setOpenContact(contacts.find((c) => c.id === contact.id) ?? contact);
            return;
          }
          setContacts((prev) => [contact, ...prev]);
          setOpenContact(contact);
        }}
      />
    </div>
  );
}

/* -------------- Filter pill -------------- */

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 28,
        padding: "0 10px",
        borderRadius: "var(--radius-pill)",
        fontSize: 12,
        fontWeight: 500,
        border: `1px solid ${active ? "var(--brand-400)" : "var(--border)"}`,
        background: active
          ? "color-mix(in oklab, var(--brand-400) 14%, transparent)"
          : "transparent",
        color: active ? "var(--brand-400)" : "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

/* -------------- Células de CRM -------------- */

/** "CPF 123.456.789-00" / "CNPJ …" — o tipo sozinho não diz nada útil na tabela. */
function formatDocumentCell(c: ContactCard): string {
  if (!c.document_number) return "—";
  const label =
    c.document_type === "pessoa_juridica"
      ? "CNPJ"
      : c.document_type === "pessoa_fisica"
        ? "CPF"
        : "";
  return label ? `${label} ${c.document_number}` : c.document_number;
}

/** "São Paulo/SP", ou só um dos dois quando o outro não foi preenchido. */
function formatCityCell(c: ContactCard): string {
  if (c.city && c.state_uf) return `${c.city}/${c.state_uf}`;
  return c.city || c.state_uf || "—";
}

/* -------------- Tabela / Lista -------------- */

function ContactTable({
  rows,
  onOpen,
}: {
  rows: ContactCard[];
  onOpen: (c: ContactCard) => void;
}) {
  return (
    <Card style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--bg-overlay)" }}>
              <Th sticky>Cliente</Th>
              <Th>Telefone</Th>
              <Th>E-mail</Th>
              <Th>Documento</Th>
              <Th>Cidade</Th>
              <Th>Etiquetas</Th>
              <Th align="right">Última interação</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => onOpen(c)}
                style={{
                  borderTop: "1px solid var(--border)",
                  cursor: "pointer",
                  background: "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Td sticky>
                  <div className="flex items-center" style={{ gap: 10 }}>
                    <Avatar contact={c} />
                    <div className="truncate" style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {c.name}
                    </div>
                  </div>
                </Td>
                <Td muted>{formatPhone(c.phone)}</Td>
                <Td muted>
                  <span className="truncate inline-block" style={{ maxWidth: 200, verticalAlign: "middle" }}>
                    {c.email || "—"}
                  </span>
                </Td>
                <Td muted>{formatDocumentCell(c)}</Td>
                <Td muted>{formatCityCell(c)}</Td>
                <Td>
                  <div className="flex flex-wrap" style={{ gap: 4 }}>
                    {c.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: "var(--radius-pill)",
                          background: "var(--bg-overlay)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    {c.tags.length > 2 && (
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        +{c.tags.length - 2}
                      </span>
                    )}
                  </div>
                </Td>
                <Td align="right" muted>
                  {formatRelative(c.lastMessageAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({
  children,
  align,
  sticky,
}: {
  children: React.ReactNode;
  align?: "right";
  sticky?: boolean;
}) {
  return (
    <th
      style={{
        padding: "10px 12px",
        textAlign: align ?? "left",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        background: sticky ? "var(--bg-overlay)" : undefined,
        zIndex: sticky ? 1 : undefined,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  muted,
  sticky,
}: {
  children: React.ReactNode;
  align?: "right";
  muted?: boolean;
  sticky?: boolean;
}) {
  return (
    <td
      style={{
        padding: "10px 12px",
        textAlign: align ?? "left",
        color: muted ? "var(--text-muted)" : "var(--text-primary)",
        whiteSpace: "nowrap",
        position: sticky ? "sticky" : undefined,
        left: sticky ? 0 : undefined,
        background: sticky ? "var(--bg-surface)" : undefined,
      }}
    >
      {children}
    </td>
  );
}

function Avatar({ contact }: { contact: ContactCard }) {
  return <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={32} />;
}
