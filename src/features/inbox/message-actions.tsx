import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Reply, Forward, Copy, Smile, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export type MessageActionContext = {
  id: string;
  isMe: boolean;
  content: string;
  mediaUrl?: string | null;
  mediaName?: string | null;
  messageType: string;
};

type Props = {
  message: MessageActionContext;
  bubbleBg: string;
  onReply?: (m: MessageActionContext) => void;
  onForward?: (m: MessageActionContext) => void;
  onReact?: (m: MessageActionContext) => void;
  onEdit?: (m: MessageActionContext) => void;
  onDelete?: (m: MessageActionContext) => void;
};

export function MessageActions({
  message,
  bubbleBg,
  onReply,
  onForward,
  onReact,
  onEdit,
  onDelete,
}: Props) {
  const { isMe } = message;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleDownload = () => {
    if (!message.mediaUrl) {
      toast.error("Nada para baixar");
      return;
    }
    const a = document.createElement("a");
    a.href = message.mediaUrl;
    a.download = message.mediaName ?? "";
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const hasMedia = !!message.mediaUrl;
  const hasText = !!message.content;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Opções da mensagem"
          onClick={(e) => e.stopPropagation()}
          className="opacity-0 group-hover/msg:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
          style={{
            position: "absolute",
            top: 0,
            right: isMe ? 0 : "auto",
            left: isMe ? "auto" : 0,
            width: 36,
            height: 26,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 6px",
            border: "none",
            cursor: "pointer",
            borderTopRightRadius: isMe ? 12 : 0,
            borderTopLeftRadius: isMe ? 0 : 12,
            background: `linear-gradient(225deg, ${bubbleBg} 45%, color-mix(in oklab, ${bubbleBg} 0%, transparent) 100%)`,
            transition: "opacity 120ms ease-out",
            zIndex: 2,
          }}
        >
          <ChevronDown size={18} color="var(--text-muted)" strokeWidth={2.25} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={isMe ? "end" : "start"}
          sideOffset={4}
          style={{
            minWidth: 200,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 50,
            fontSize: 13,
            color: "var(--text-primary)",
          }}
        >
          <Item icon={<Reply size={15} />} label="Responder" onSelect={() => onReply?.(message)} />
          <Item icon={<Smile size={15} />} label="Reagir" onSelect={() => onReact?.(message)} />
          <Item icon={<Forward size={15} />} label="Encaminhar" onSelect={() => onForward?.(message)} />
          {hasText && <Item icon={<Copy size={15} />} label="Copiar" onSelect={handleCopy} />}
          {hasMedia && <Item icon={<Download size={15} />} label="Baixar" onSelect={handleDownload} />}
          {isMe && hasText && (
            <Item icon={<Pencil size={15} />} label="Editar" onSelect={() => onEdit?.(message)} />
          )}
          {isMe && (
            <>
              <DropdownMenu.Separator style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
              <Item
                icon={<Trash2 size={15} />}
                label="Apagar para todos"
                danger
                onSelect={() => onDelete?.(message)}
              />
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  icon,
  label,
  onSelect,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        cursor: "pointer",
        outline: "none",
        color: danger ? "var(--danger, #ef4444)" : "var(--text-primary)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-overlay)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span style={{ display: "inline-flex", color: danger ? "var(--danger, #ef4444)" : "var(--text-muted)" }}>
        {icon}
      </span>
      <span>{label}</span>
    </DropdownMenu.Item>
  );
}
