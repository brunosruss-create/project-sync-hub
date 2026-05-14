import * as React from "react";
import { X, Search, Loader2, UserPlus, UserMinus, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listAssignableMembers,
  assignContact,
  type AssignableMember,
} from "@/lib/assignment.functions";

interface Props {
  open: boolean;
  contactId: string | null;
  contactName?: string | null;
  currentAssignedAgentId?: string | null;
  onClose: () => void;
  onAssigned: (agentUserId: string | null, member: AssignableMember | null) => void;
}

export function TransferConversationModal({
  open,
  contactId,
  contactName,
  currentAssignedAgentId,
  onClose,
  onAssigned,
}: Props) {
  const fetchMembers = useServerFn(listAssignableMembers);
  const assignFn = useServerFn(assignContact);
  const [query, setQuery] = React.useState("");
  const [submitting, setSubmitting] = React.useState<string | "unassign" | null>(null);

  const membersQ = useQuery({
    queryKey: ["assignable-members"],
    queryFn: () => fetchMembers(),
    enabled: open,
    staleTime: 60_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  const members = membersQ.data ?? [];
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = (m.full_name ?? "").toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, query]);

  const handleAssign = async (agentUserId: string | null) => {
    if (!contactId) return;
    setSubmitting(agentUserId ?? "unassign");
    try {
      const res = await assignFn({ data: { contactId, agentUserId } });
      const m = agentUserId ? members.find((x) => x.user_id === agentUserId) ?? null : null;
      onAssigned(res.agentUserId, m);
      toast.success(
        agentUserId
          ? `Atendimento transferido para ${m?.full_name || m?.email || "membro"}`
          : "Atribuição removida",
      );
      onClose();
    } catch (e: any) {
      toast.error("Falha ao transferir", { description: e?.message ?? String(e) });
    } finally {
      setSubmitting(null);
    }
  };

  if (!open || !contactId) return null;

  const ROLE_LABEL: Record<string, string> = { manager: "Manager", agent: "Agente" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transferir atendimento"
      onClick={() => !submitting && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        animation: "fadeSlideIn 150ms ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 440,
          maxHeight: "85vh",
          background: "var(--bg-surface)",
          borderRadius: 14,
          border: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <UserPlus size={18} />
          <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>
            Transferir atendimento
          </div>
          <button
            onClick={onClose}
            disabled={!!submitting}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              color: "var(--text-secondary)",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Subtitle */}
        {contactName && (
          <div
            style={{
              padding: "10px 16px",
              background: "var(--bg-base)",
              borderBottom: "1px solid var(--border-subtle)",
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            Conversa com{" "}
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
              {contactName}
            </span>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              background: "var(--bg-base)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
            }}
          >
            <Search size={14} color="var(--text-secondary)" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar membro"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text-primary)",
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 200 }}>
          {membersQ.isLoading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}>
              <Loader2 className="animate-spin" size={18} style={{ display: "inline-block" }} />
            </div>
          ) : membersQ.isError ? (
            <div style={{ padding: 24, textAlign: "center", color: "#EF4444", fontSize: 13 }}>
              Falha ao carregar membros
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              Nenhum membro encontrado
            </div>
          ) : (
            filtered.map((m) => {
              const isCurrent = m.user_id === currentAssignedAgentId;
              const busy = submitting === m.user_id;
              const displayName = m.full_name || m.email || "Sem nome";
              return (
                <button
                  key={m.user_id}
                  disabled={!!submitting || isCurrent}
                  onClick={() => handleAssign(m.user_id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 16px",
                    background: isCurrent ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: submitting || isCurrent ? "default" : "pointer",
                    textAlign: "left",
                    opacity: submitting && !busy ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {displayName}
                      {m.is_self && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 999,
                            background: "var(--bg-overlay)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Você
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {ROLE_LABEL[m.role] ?? m.role} · {m.email}
                    </div>
                  </div>
                  {busy ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : isCurrent ? (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--brand-400)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontWeight: 600,
                      }}
                    >
                      <Check size={14} /> Atual
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          {currentAssignedAgentId ? (
            <button
              onClick={() => handleAssign(null)}
              disabled={!!submitting}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-primary)",
                cursor: submitting ? "not-allowed" : "pointer",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {submitting === "unassign" ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <UserMinus size={14} />
              )}
              Remover atribuição
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            disabled={!!submitting}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "transparent",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
              cursor: submitting ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
