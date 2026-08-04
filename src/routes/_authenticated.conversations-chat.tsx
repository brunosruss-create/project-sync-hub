import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChatView } from "@/components/chat/ChatView";

const searchSchema = z.object({
  id: fallback(z.string(), "").optional(),
});

export const Route = createFileRoute("/_authenticated/conversations-chat")({
  validateSearch: zodValidator(searchSchema),
  component: ChatPage,
});

// O menu já é um rail fixo de ícones, então esta tela não precisa mais
// encolhê-lo ao entrar (nem restaurar ao sair) como fazia antes.
function ChatPage() {
  return (
    <div className="chat-page-fill">
      <ChatView />
    </div>
  );
}
