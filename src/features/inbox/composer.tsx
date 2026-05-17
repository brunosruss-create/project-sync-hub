import * as React from "react";
import {
  Smile,
  Paperclip,
  Mic,
  Send,
  Trash2,
  X,
  Image as ImageIcon,
  FileText,
  Camera,
  Play,
  Pause,
  Link as LinkIcon,
} from "lucide-react";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data";
import { toast } from "sonner";

const MAX_CHARS = 4096;
const MAX_RECORD_MS = 5 * 60 * 1000;

type AttachmentItem = { file: File; previewUrl?: string };

type Props = {
  draft: string;
  setDraft: (s: string) => void;
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  onSend: () => void;
  onClosePanel?: () => void;
  onSendAttachments?: (files: File[], caption: string) => Promise<void>;
  onSendAudio?: (blob: Blob) => Promise<void>;
  replyingTo?: { author: string; content: string; isMe: boolean } | null;
  onCancelReply?: () => void;
  bookingUrl?: string | null;
};

export function Composer({ draft, setDraft, taRef, onSend, onClosePanel, onSendAttachments, onSendAudio, replyingTo, onCancelReply, bookingUrl }: Props) {
  const hasText = draft.trim().length > 0;
  const nearLimit = draft.length > MAX_CHARS - 200;

  const [showEmoji, setShowEmoji] = React.useState(false);
  const [showAttachMenu, setShowAttachMenu] = React.useState(false);
  const [attachments, setAttachments] = React.useState<AttachmentItem[]>([]);
  const [caption, setCaption] = React.useState("");

  const [isRecording, setIsRecording] = React.useState(false);
  const [recordMs, setRecordMs] = React.useState(0);
  const [audioPreview, setAudioPreview] = React.useState<{ blob: Blob; url: string; ms: number } | null>(null);
  const [isCancelingRec, setIsCancelingRec] = React.useState(false);

  const composerWrapRef = React.useRef<HTMLDivElement | null>(null);
  const emojiWrapRef = React.useRef<HTMLDivElement | null>(null);
  const attachWrapRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputCfgRef = React.useRef<{ accept: string; multiple: boolean; capture?: string }>({
    accept: "*",
    multiple: false,
  });

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const recStartRef = React.useRef<number>(0);
  const recTimerRef = React.useRef<number | null>(null);
  const recAutoStopRef = React.useRef<number | null>(null);
  const longPressTimerRef = React.useRef<number | null>(null);
  const pointerStartXRef = React.useRef<number>(0);
  const cancelingRef = React.useRef(false);

  // --- close popovers on outside click / escape
  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (showEmoji && emojiWrapRef.current && !emojiWrapRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
      if (showAttachMenu && attachWrapRef.current && !attachWrapRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showEmoji) { setShowEmoji(false); return; }
      if (showAttachMenu) { setShowAttachMenu(false); return; }
      if (attachments.length > 0) { clearAttachments(); return; }
      if (audioPreview) { discardAudioPreview(); return; }
      if (isRecording) { cancelRecording(); return; }
      onClosePanel?.();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [showEmoji, showAttachMenu, attachments.length, audioPreview, isRecording, onClosePanel]);

  // --- auto-resize textarea
  const autoResize = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [taRef]);

  React.useEffect(() => { autoResize(); }, [draft, autoResize]);

  // --- emoji insert at cursor
  const insertEmoji = (emoji: { native: string }) => {
    const el = taRef.current;
    if (!el) {
      setDraft(draft + emoji.native);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = (draft.slice(0, start) + emoji.native + draft.slice(end)).slice(0, MAX_CHARS);
    setDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.native.length;
      el.selectionStart = el.selectionEnd = pos;
    });
  };

  // --- attachments
  const openFilePicker = (cfg: { accept: string; multiple: boolean; capture?: string }) => {
    fileInputCfgRef.current = cfg;
    setShowAttachMenu(false);
    requestAnimationFrame(() => fileInputRef.current?.click());
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const items: AttachmentItem[] = Array.from(files).map((file) => ({
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setAttachments((prev) => [...prev, ...items]);
  };

  const clearAttachments = () => {
    attachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
    setCaption("");
  };

  const [sendingAttach, setSendingAttach] = React.useState(false);
  const sendAttachments = async () => {
    if (sendingAttach) return;
    if (!onSendAttachments) {
      toast.error("Envio de anexo indisponível.");
      return;
    }
    setSendingAttach(true);
    try {
      await onSendAttachments(attachments.map((a) => a.file), caption);
      clearAttachments();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar anexo.");
    } finally {
      setSendingAttach(false);
    }
  };

  // --- paste image
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of Array.from(items)) {
      if (it.type.startsWith("image/")) {
        e.preventDefault();
        const blob = it.getAsFile();
        if (blob) {
          const file = new File([blob], `pasted-${Date.now()}.png`, { type: blob.type });
          handleFiles({ 0: file, length: 1, item: () => file } as unknown as FileList);
        }
        return;
      }
    }
  };

  // --- recording
  const pickMime = (): string | undefined => {
    if (typeof MediaRecorder === "undefined") return undefined;
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const m of candidates) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {}
    }
    return undefined;
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Microfone indisponível neste navegador.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      if (err?.name === "NotAllowedError") toast.error("Permissão de microfone negada.");
      else if (err?.name === "NotFoundError") toast.error("Nenhum microfone encontrado.");
      else if (err?.name === "NotReadableError") toast.error("Microfone em uso por outro app.");
      else toast.error("Não foi possível acessar o microfone.");
      return;
    }
    try {
      const mimeType = pickMime();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      chunksRef.current = [];
      cancelingRef.current = false;
      setIsCancelingRec(false);
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ms = Date.now() - recStartRef.current;
        if (cancelingRef.current) {
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size > 0) {
          setAudioPreview({ blob, url: URL.createObjectURL(blob), ms });
        } else {
          toast.error("Áudio vazio. Tente novamente.");
        }
      };
      rec.onerror = () => toast.error("Erro ao gravar áudio.");
      rec.start(250);
      recStartRef.current = Date.now();
      setRecordMs(0);
      setIsRecording(true);
      recTimerRef.current = window.setInterval(() => {
        setRecordMs(Date.now() - recStartRef.current);
      }, 100);
      recAutoStopRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORD_MS);
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop());
      toast.error(e?.message ?? "Falha ao iniciar gravação.");
    }
  };

  const cleanupRecTimers = () => {
    if (recTimerRef.current) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
    if (recAutoStopRef.current) { window.clearTimeout(recAutoStopRef.current); recAutoStopRef.current = null; }
  };

  const stopRecording = () => {
    cleanupRecTimers();
    setIsRecording(false);
    setIsCancelingRec(false);
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const cancelRecording = () => {
    cancelingRef.current = true;
    setIsCancelingRec(true);
    stopRecording();
  };

  const discardAudioPreview = () => {
    if (audioPreview) URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
  };

  const [sendingAudio, setSendingAudio] = React.useState(false);
  const sendAudio = async () => {
    if (sendingAudio || !audioPreview) return;
    if (!onSendAudio) {
      toast.error("Envio de áudio indisponível.");
      return;
    }
    setSendingAudio(true);
    const blob = audioPreview.blob;
    discardAudioPreview();
    try {
      await onSendAudio(blob);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar áudio.");
    } finally {
      setSendingAudio(false);
    }
  };

  // Mic interactions:
  // - Desktop (mouse): click to start, click again to stop. No long-press.
  // - Touch: tap to start, tap again to stop. Swipe-left while pressing the
  //   stop button cancels (whatsapp-like).
  const isTouchPointer = (e: React.PointerEvent) =>
    e.pointerType === "touch" || e.pointerType === "pen";

  const onMicPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    pointerStartXRef.current = e.clientX;
    if (isRecording && isTouchPointer(e)) {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const onMicPointerMove = (e: React.PointerEvent) => {
    if (!isRecording || !isTouchPointer(e)) return;
    const dx = e.clientX - pointerStartXRef.current;
    setIsCancelingRec(dx < -80);
  };

  const onMicPointerUp = (e: React.PointerEvent) => {
    if (isRecording && isTouchPointer(e)) {
      const dx = e.clientX - pointerStartXRef.current;
      if (dx < -80) { cancelRecording(); return; }
    }
    // Toggle on click (covers mouse + tap)
    if (isRecording) stopRecording();
    else startRecording();
  };

  // ============ RENDER ============

  // ---- Recording mode (replaces composer)
  if (isRecording) {
    const mm = Math.floor(recordMs / 1000 / 60);
    const ss = Math.floor((recordMs / 1000) % 60).toString().padStart(2, "0");
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 60,
        }}
      >
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancelar gravação"
          style={{
            width: 36, height: 36, borderRadius: 999,
            background: "transparent", color: "#EF4444",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "1px solid var(--border)",
          }}
        >
          <Trash2 size={16} />
        </button>
        <div className="flex-1" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)" }}>
          <span
            style={{
              width: 10, height: 10, borderRadius: 999,
              background: "#EF4444",
              animation: "recPulse 1s ease-in-out infinite",
              flexShrink: 0,
            }}
          />
          <span className="font-mono" style={{ fontSize: 13, minWidth: 44 }}>{mm}:{ss}</span>
          <Waveform />
          <span style={{ fontSize: 11, color: isCancelingRec ? "#EF4444" : "var(--text-muted)", marginLeft: "auto" }}>
            {isCancelingRec ? "← solte para cancelar" : "← deslize para cancelar"}
          </span>
        </div>
        <button
          type="button"
          onPointerDown={onMicPointerDown}
          onPointerMove={onMicPointerMove}
          onPointerUp={onMicPointerUp}
          aria-label="Soltar para enviar"
          style={{
            width: 40, height: 40, borderRadius: 999,
            background: isCancelingRec ? "#EF4444" : "var(--brand-400)",
            color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "background 150ms ease",
          }}
        >
          <Mic size={18} />
        </button>
      </div>
    );
  }

  // ---- Audio preview mode
  if (audioPreview) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          padding: "10px 12px",
        }}
      >
        <AudioPreviewPlayer
          url={audioPreview.url}
          ms={audioPreview.ms}
          onDiscard={discardAudioPreview}
          onSend={sendAudio}
        />
      </div>
    );
  }

  return (
    <div ref={composerWrapRef} style={{ position: "relative" }}>
      {/* Reply quote bar */}
      {replyingTo && (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 8,
            padding: "8px 10px",
            margin: "0 12px 6px",
            background: "var(--bg-overlay)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            borderLeft: `3px solid ${replyingTo.isMe ? "var(--brand-400)" : "#9aa3af"}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: replyingTo.isMe ? "var(--brand-400)" : "var(--text-primary)" }}>
              {replyingTo.author}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {replyingTo.content || "Mídia"}
            </div>
          </div>
          <button
            type="button"
            aria-label="Cancelar resposta"
            onClick={onCancelReply}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 4,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Attachment preview area */}
      {attachments.length > 0 && (
        <AttachmentPreviewBar
          items={attachments}
          caption={caption}
          setCaption={setCaption}
          onCancel={clearAttachments}
          onSend={sendAttachments}
        />
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept={fileInputCfgRef.current.accept}
        multiple={fileInputCfgRef.current.multiple}
        {...(fileInputCfgRef.current.capture ? { capture: fileInputCfgRef.current.capture as any } : {})}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
      />

      {/* Emoji picker */}
      {showEmoji && (
        <div
          ref={emojiWrapRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 8,
            zIndex: 50,
          }}
        >
          <Picker
            data={emojiData}
            onEmojiSelect={insertEmoji}
            theme="dark"
            locale="pt"
            previewPosition="none"
            skinTonePosition="none"
            set="native"
            perLine={8}
            maxFrequentRows={2}
          />
        </div>
      )}

      {/* Attachment popover */}
      {showAttachMenu && (
        <div
          ref={attachWrapRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 12,
            zIndex: 50,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            padding: 12,
            display: "flex",
            gap: 14,
            boxShadow: "0 12px 28px rgba(0,0,0,0.32)",
            animation: "fadeSlideIn 150ms ease-out",
          }}
        >
          <AttachOption
            color="#7C3AED"
            icon={<ImageIcon size={20} />}
            label="Imagem"
            onClick={() => openFilePicker({ accept: "image/*", multiple: true })}
          />
          <AttachOption
            color="#3B82F6"
            icon={<FileText size={20} />}
            label="Documento"
            onClick={() => openFilePicker({ accept: ".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip", multiple: false })}
          />
          <AttachOption
            color="#EF4444"
            icon={<Camera size={20} />}
            label="Câmera"
            onClick={() => openFilePicker({ accept: "image/*", multiple: false, capture: "environment" })}
          />
        </div>
      )}

      {/* Composer bar */}
      <div
        style={{
          background: "var(--bg-surface)",
          borderTop: "1px solid var(--border)",
          padding: "10px 12px",
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
        }}
      >
        {/* Bubble */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-strong)",
            borderRadius: 24,
            padding: "8px 14px",
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            minHeight: 40,
          }}
        >
          <button
            type="button"
            aria-label="Emoji"
            onClick={() => { setShowAttachMenu(false); setShowEmoji((v) => !v); }}
            style={iconBtn}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <Smile size={20} />
          </button>
          <button
            type="button"
            aria-label="Anexar"
            onClick={() => { setShowEmoji(false); setShowAttachMenu(false); openFilePicker({ accept: "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv", multiple: true }); }}
            style={iconBtn}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <Paperclip size={20} />
          </button>
          <button
            type="button"
            aria-label={isRecording ? "Parar gravação" : "Gravar áudio"}
            onPointerDown={onMicPointerDown}
            onPointerMove={onMicPointerMove}
            onPointerUp={onMicPointerUp}
            style={iconBtn}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            <Mic size={20} />
          </button>
          {bookingUrl && (
            <button
              type="button"
              aria-label="Enviar link de agendamento"
              title="Inserir link de agendamento"
              onClick={() => {
                const prefix = draft.trim()
                  ? draft.replace(/\s+$/, "") + "\n\n"
                  : "Olá! Você pode agendar pelo link: ";
                setDraft((prefix + bookingUrl).slice(0, MAX_CHARS));
                requestAnimationFrame(() => taRef.current?.focus());
              }}
              style={iconBtn}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--brand-400)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              <LinkIcon size={20} />
            </button>
          )}
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            onPaste={handlePaste}
            placeholder="Mensagem"
            rows={1}
            className="chat-input-textarea"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text-primary)",
              fontSize: 14,
              lineHeight: "20px",
              fontFamily: "inherit",
              padding: 0,
              minHeight: 20,
              maxHeight: 120,
              alignSelf: "center",
              resize: "none",
              overflow: "hidden",
            }}
          />
        </div>

        {/* Send button (always round, always Send) */}
        <button
          type="button"
          aria-label="Enviar"
          onClick={onSend}
          disabled={!hasText}
          style={{
            width: 40, height: 40, borderRadius: 999,
            background: "var(--brand-400)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            alignSelf: "flex-end",
            transition: "transform 150ms ease, background 150ms ease, opacity 150ms ease",
            cursor: hasText ? "pointer" : "not-allowed",
            opacity: hasText ? 1 : 0.45,
            border: "none",
          }}
          onMouseEnter={(e) => {
            if (!hasText) return;
            e.currentTarget.style.background = "var(--brand-600)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--brand-400)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          onMouseDown={(e) => { if (hasText) e.currentTarget.style.transform = "scale(0.95)"; }}
          onMouseUp={(e) => { if (hasText) e.currentTarget.style.transform = "scale(1.05)"; }}
        >
          <Send size={18} />
        </button>
      </div>

      {nearLimit && (
        <div
          style={{
            padding: "0 16px 6px",
            fontSize: 11,
            textAlign: "right",
            color: draft.length >= MAX_CHARS ? "#EF4444" : "var(--text-muted)",
            background: "var(--bg-surface)",
          }}
        >
          {draft.length} / {MAX_CHARS}
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "flex-end",
  marginBottom: 2,
  transition: "color 120ms ease",
  flexShrink: 0,
};

function AttachOption({
  color, icon, label, onClick,
}: { color: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        background: "transparent", border: "none", cursor: "pointer", padding: 4,
      }}
    >
      <span
        style={{
          width: 48, height: 48, borderRadius: 999,
          background: color, color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          transition: "transform 120ms ease",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = "scale(1.08)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = "scale(1)")}
      >
        {icon}
      </span>
      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
    </button>
  );
}

function Waveform() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, height: 20, flex: 1 }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 2,
            background: "var(--brand-400)",
            borderRadius: 2,
            animation: `recBar 0.9s ease-in-out ${i * 60}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}

function AttachmentPreviewBar({
  items, caption, setCaption, onCancel, onSend,
}: {
  items: AttachmentItem[];
  caption: string;
  setCaption: (v: string) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const visible = items.slice(0, 4);
  const extra = items.length - visible.length;
  const first = items[0]?.file;
  const sizeKb = first ? Math.round(first.size / 1024) : 0;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--border)",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        animation: "fadeSlideIn 150ms ease-out",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar anexo"
          style={{
            width: 24, height: 24, borderRadius: 999,
            background: "var(--bg-overlay)", color: "var(--text-muted)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "1px solid var(--border)",
          }}
        >
          <X size={12} />
        </button>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {items.length === 1 ? "Arquivo selecionado" : `${items.length} arquivos`}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(visible.length, 2)}, 60px)`, gap: 4 }}>
          {visible.map((it, i) => (
            <div
              key={i}
              style={{
                width: 60, height: 60, borderRadius: 8, overflow: "hidden",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                position: "relative",
              }}
            >
              {it.previewUrl ? (
                <img src={it.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <FileText size={24} color="var(--text-muted)" />
              )}
              {i === visible.length - 1 && extra > 0 && (
                <div
                  style={{
                    position: "absolute", inset: 0,
                    background: "rgba(0,0,0,0.55)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 600,
                  }}
                >
                  +{extra}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {first?.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {sizeKb} KB · {first?.type || "Arquivo"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Adicionar legenda (opcional)…"
          style={{
            flex: 1,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-strong)",
            borderRadius: 20,
            padding: "8px 14px",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={onSend}
          aria-label="Enviar anexo"
          style={{
            width: 40, height: 40, borderRadius: 999,
            background: "var(--brand-400)", color: "#fff",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "none", cursor: "pointer",
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

function AudioPreviewPlayer({
  url, ms, onDiscard, onSend,
}: { url: string; ms: number; onDiscard: () => void; onSend: () => void }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const total = Math.max(1, Math.round(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = (total % 60).toString().padStart(2, "0");
  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        style={{
          width: 40, height: 40, borderRadius: 999,
          background: "var(--bg-overlay)", color: "var(--text-primary)",
          border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, height: 20 }}>
        {Array.from({ length: 32 }).map((_, i) => (
          <span key={i} style={{
            flex: 1, background: i < 22 ? "var(--brand-400)" : "var(--border-strong)",
            height: `${30 + ((i * 17) % 70)}%`, borderRadius: 2,
          }} />
        ))}
      </div>
      <span className="font-mono" style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 36 }}>{mm}:{ss}</span>
      <button
        type="button"
        onClick={onDiscard}
        aria-label="Descartar áudio"
        style={{
          width: 36, height: 36, borderRadius: 999,
          background: "transparent", color: "#EF4444",
          border: "1px solid var(--border)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Trash2 size={16} />
      </button>
      <button
        type="button"
        onClick={onSend}
        aria-label="Enviar áudio"
        style={{
          width: 40, height: 40, borderRadius: 999,
          background: "var(--brand-400)", color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: "none",
        }}
      >
        <Send size={18} />
      </button>
    </div>
  );
}
