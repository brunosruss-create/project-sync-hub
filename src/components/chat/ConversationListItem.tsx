import { ContactAvatar } from "@/features/inbox/contact-avatar";
import {
  formatRelative,
  formatMessagePreview,
  type ContactCard as Contact,
  type KanbanColumnDef,
} from "@/features/inbox/data";

export function ConversationListItem({
  contact,
  active,
  columns,
  onClick,
}: {
  contact: Contact;
  active: boolean;
  columns: KanbanColumnDef[];
  onClick: () => void;
}) {
  const col = columns.find((c) => c.slug === contact.kanban_column);
  const statusColor = col?.color ?? "var(--text-muted)";
  const unread = contact.unreadCount ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left transition-colors"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        // Sem divisória entre linhas: o realce arredondado do hover/ativo já
        // separa os itens, e as réguas deixavam a lista pesada (WhatsApp Web
        // também não as usa).
        width: "calc(100% - 12px)",
        margin: "1px 6px",
        borderRadius: "var(--radius-card)",
        background: active
          ? "color-mix(in oklab, var(--brand-400) 12%, transparent)"
          : "transparent",
        cursor: "pointer",
        opacity: contact.is_blocked ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-overlay)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <ContactAvatar name={contact.name} avatarUrl={contact.avatar} size={42} channel={contact.channel} />
        <span
          title={col?.label ?? ""}
          style={{
            position: "absolute",
            bottom: -1,
            right: -1,
            width: 12,
            height: 12,
            borderRadius: "var(--radius-pill)",
            background: statusColor,
            border: "2px solid var(--bg-surface)",
          }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center" style={{ gap: 6 }}>
          <span
            className="truncate flex-1"
            style={{
              fontSize: 13.5,
              fontWeight: unread > 0 ? 700 : 500,
              color: "var(--text-primary)",
            }}
          >
            {contact.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
            {formatRelative(contact.lastMessageAt)}
          </span>
        </div>
        <div
          className="flex items-center"
          style={{ gap: 6, marginTop: 2 }}
        >
          <span
            className="truncate flex-1 flex items-center"
            style={{
              gap: 4,
              fontSize: 12.5,
              color: unread > 0 ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: unread > 0 ? 500 : 400,
            }}
          >
            {(() => {
              const preview = formatMessagePreview(contact.lastMessage, contact.lastDirection);
              const Icon = preview.icon;
              return (
                <>
                  {Icon && <Icon size={12} style={{ flexShrink: 0 }} />}
                  <span className="truncate">{preview.label}</span>
                </>
              );
            })()}
          </span>
          {unread > 0 && (
            <span
              style={{
                background: "var(--brand-400)",
                color: "#fff",
                fontSize: 10.5,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                padding: "0 6px",
                borderRadius: "var(--radius-pill)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
          {contact.priority === "urgent" && (
            <span
              title="Urgente"
              style={{
                width: 6,
                height: 6,
                borderRadius: "var(--radius-pill)",
                background: "#EF4444",
                flexShrink: 0,
              }}
            />
          )}
        </div>
      </div>
    </button>
  );
}
