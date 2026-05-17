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

function ChatPage() {
  return (
    <div
      style={{
        height: "calc(100vh - 56px - 48px)",
        margin: -24,
      }}
    >
      <ChatView />
    </div>
  );
}
