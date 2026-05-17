import { useEffect } from "react";
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
  useEffect(() => {
    // Save previous state only once (avoid clobbering if effect re-runs)
    if (localStorage.getItem("sidebar_chat_previous") === null) {
      const previous = localStorage.getItem("sidebar_collapsed") ?? "false";
      localStorage.setItem("sidebar_chat_previous", previous);
    }
    window.dispatchEvent(
      new CustomEvent("sidebar:setCollapsed", { detail: { collapsed: true } }),
    );
    return () => {
      const wasCollapsed = localStorage.getItem("sidebar_chat_previous") === "true";
      window.dispatchEvent(
        new CustomEvent("sidebar:setCollapsed", { detail: { collapsed: wasCollapsed } }),
      );
      localStorage.removeItem("sidebar_chat_previous");
    };
  }, []);

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
