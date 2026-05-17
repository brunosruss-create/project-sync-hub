import * as React from "react";
import { Play, Pause, Mic } from "lucide-react";
import { ContactAvatar } from "@/features/inbox/contact-avatar";
import { useProfile } from "@/hooks/use-profile";

export function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

export function AudioPlayerWithMe({
  src,
  contactName,
  contactAvatar,
  isMe,
}: {
  src: string;
  contactName: string;
  contactAvatar: string | null;
  isMe: boolean;
}) {
  const { data: profile } = useProfile();
  const avatarName = isMe ? (profile?.full_name ?? "Eu") : contactName;
  const avatarUrl = isMe ? (profile?.avatar_url ?? null) : contactAvatar;
  return <AudioPlayer src={src} avatarName={avatarName} avatarUrl={avatarUrl} isMe={isMe} />;
}

export function AudioPlayer({
  src,
  avatarName,
  avatarUrl,
  isMe,
}: {
  src: string;
  avatarName: string;
  avatarUrl: string | null;
  isMe: boolean;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [seeking, setSeeking] = React.useState(false);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    let fixingDuration = false;
    const onTime = () => {
      if (fixingDuration) return;
      if (!seeking) setCur(a.currentTime);
    };
    const onMeta = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        setDur(a.duration);
      } else {
        fixingDuration = true;
        try { a.currentTime = 1e101; } catch {}
      }
    };
    const onDurChange = () => {
      if (isFinite(a.duration) && a.duration > 0) {
        setDur(a.duration);
        if (fixingDuration) {
          fixingDuration = false;
          try { a.currentTime = 0; } catch {}
        }
      }
    };
    const onEnd = () => { setPlaying(false); setCur(0); a.currentTime = 0; };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onDurChange);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    try { a.load(); } catch {}
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onDurChange);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [seeking]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    const a = audioRef.current;
    if (!el || !a || !dur) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * dur;
    setCur(t);
    a.currentTime = t;
  };

  const onTrackPointerDown = (e: React.PointerEvent) => {
    setSeeking(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onTrackPointerMove = (e: React.PointerEvent) => {
    if (!seeking) return;
    seekFromEvent(e.clientX);
  };
  const onTrackPointerUp = (e: React.PointerEvent) => {
    if (!seeking) return;
    seekFromEvent(e.clientX);
    setSeeking(false);
  };

  const progress = dur > 0 ? cur / dur : 0;
  const accent = isMe ? "var(--brand-400)" : "var(--text-muted)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 240 }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <ContactAvatar name={avatarName} avatarUrl={avatarUrl ?? undefined} size={42} />
        <div
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--brand-400)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg-surface)",
          }}
        >
          <Mic size={10} />
        </div>
      </div>

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        style={{
          width: 32, height: 32, borderRadius: 999,
          background: "transparent",
          color: "var(--text-primary)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: "none", cursor: "pointer", flexShrink: 0,
        }}
      >
        {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
      </button>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          style={{
            position: "relative",
            height: 18,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0, right: 0, top: "50%",
              transform: "translateY(-50%)",
              height: 2,
              backgroundImage: `radial-gradient(circle, var(--text-muted) 0.9px, transparent 1.1px)`,
              backgroundSize: "6px 2px",
              backgroundRepeat: "repeat-x",
              opacity: 0.55,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              height: 2,
              width: `${progress * 100}%`,
              background: accent,
              borderRadius: 2,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${progress * 100}% - 6px)`,
              top: "50%",
              transform: "translateY(-50%)",
              width: 12,
              height: 12,
              borderRadius: 999,
              background: accent,
              boxShadow: "0 0 0 2px var(--bg-surface)",
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
          {fmtTime(playing || cur > 0 ? cur : dur)}
        </div>
      </div>

      <audio ref={audioRef} src={src} preload="metadata" style={{ display: "none" }} />
    </div>
  );
}
