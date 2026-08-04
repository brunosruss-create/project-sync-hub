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
import { listDepartments } from "@/lib/departments.functions";

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
  const fetchDepartments = useServerFn(listDepartments);
  const assignFn = useServerFn(assignContact);
  const [query, setQuery] = React.useState("");
  const [submitting, setSubmitting] = React.useState<string | "unassign" | null>(null);
  /** `null` = todos (sem filtro de departamento). */
  const [deptId, setDeptId] = React.useState<string | null>(null);

  const membersQ = useQuery({
    queryKey: ["assignable-members"],
    queryFn: () => fetchMembers(),
    enabled: open,
    staleTime: 60_000,
  });

  const deptQ = useQuery({
    queryKey: ["departments"],
    queryFn: () => fetchDepartments(),
    enabled: open,
    staleTime: 60_000,
  });

  // Só no dep array `[open]`, de propósito: `onClose` é uma função nova a
  // cada render do pai (realtime de contatos/mensagens re-renderiza a tela
  // inteira o tempo todo), e com ela na lista de dependências este efeito
  // reexecutava a cada atualização em segundo plano — resetando o
  // departamento escolhido bem no meio do clique do usuário.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setDeptId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  const members = membersQ.data ?? [];
  // Departamentos inativos não são destino de transferência, mas continuam
  // existindo para quem já está neles.
  const departments = (deptQ.data ?? []).filter((d) => d.is_active);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (deptId && m.department_id !== deptId) return false;
      if (!q) return true;
      const name = (m.full_name ?? "").toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, query, deptId]);

  const handleAssign = async (agentUserId: string | null) => {
    if (!contactId) return;
    setSubmitting(agentUserId ?? "unassign");
    try {
      // Departamento vai junto: transferir para "Vendas" sem escolher pessoa
      // deixa o rodízio daquele departamento decidir no servidor.
      const res = await assignFn({
        data: { contactId, agentUserId, departmentId: deptId },
      });
      const escolhido = res.agentUserId
        ? members.find((x) => x.user_id === res.agentUserId) ?? null
        : null;
      onAssigned(res.agentUserId, escolhido);
      const nomeDept = departments.find((d) => d.id === deptId)?.name;
      toast.success(
        res.agentUserId
          ? `Atendimento transferido para ${escolhido?.full_name || escolhido?.email || "membro"}`
          : nomeDept
            ? `Conversa enviada para ${nomeDept} — ninguém no rodízio ainda`
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
          borderRadius: "var(--radius-modal)",
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

        {/* Departamento — some inteiro se o workspace não tem nenhum, para a
            transferência continuar sendo um passo só nesse caso. */}
        {departments.length > 0 && (
          <div style={{ padding: "10px 12px 0" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Departamento
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
              {[{ id: null as string | null, name: "Todos" }, ...departments].map((d) => {
                const ativo = deptId === d.id;
                return (
                  <button
                    key={d.id ?? "all"}
                    type="button"
                    onClick={() => setDeptId(d.id)}
                    style={{
                      height: 26,
                      padding: "0 12px",
                      borderRadius: "var(--radius-pill)",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      border: "1px solid",
                      borderColor: ativo ? "var(--brand-400)" : "var(--border)",
                      background: ativo
                        ? "color-mix(in oklab, var(--brand-400) 14%, transparent)"
                        : "transparent",
                      color: ativo ? "var(--brand-400)" : "var(--text-muted)",
                    }}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
            {deptId && (
              <button
                type="button"
                disabled={!!submitting}
                onClick={() => void handleAssign(null)}
                className="flex items-center justify-center w-full"
                style={{
                  marginTop: 10,
                  height: 34,
                  borderRadius: "var(--radius-pill)",
                  border: "1px solid var(--brand-400)",
                  background: "color-mix(in oklab, var(--brand-400) 10%, transparent)",
                  color: "var(--brand-400)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: submitting ? "not-allowed" : "pointer",
                  gap: 6,
                }}
              >
                {submitting === "unassign" ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <UserPlus size={14} />
                )}
                Enviar ao departamento — o rodízio escolhe
              </button>
            )}
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
              borderRadius: "var(--radius-card)",
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
                            borderRadius: "var(--radius-pill)",
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
                borderRadius: "var(--radius-card)",
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
              borderRadius: "var(--radius-card)",
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
