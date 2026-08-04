import * as React from "react";
import { initials } from "./data";
import { SiWhatsapp, SiInstagram } from "@icons-pack/react-simple-icons";

function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 40%)`;
}

type Channel = "whatsapp_evolution" | "whatsapp_cloud" | "instagram" | null | undefined;

/** Badge pequeno no canto inferior-direito do avatar indicando o canal. */
function ChannelBadge({ channel, size }: { channel: Channel; size: number }) {
  if (!channel) return null;
  const badgeSize = Math.max(12, Math.round(size * 0.38));
  const isWhatsApp = channel === "whatsapp_evolution" || channel === "whatsapp_cloud";
  const isInstagram = channel === "instagram";
  if (!isWhatsApp && !isInstagram) return null;

  return (
    <span
      aria-label={isWhatsApp ? "WhatsApp" : "Instagram"}
      style={{
        position: "absolute",
        bottom: -1,
        right: -1,
        width: badgeSize,
        height: badgeSize,
        borderRadius: "50%",
        background: isWhatsApp ? "#25D366" : "#E4405F",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1.5px solid var(--bg-surface, #fff)",
      }}
    >
      {isWhatsApp ? (
        <SiWhatsapp size={Math.round(badgeSize * 0.6)} color="#fff" />
      ) : (
        <SiInstagram size={Math.round(badgeSize * 0.6)} color="#fff" />
      )}
    </span>
  );
}

export function ContactAvatar({
  name,
  avatarUrl,
  size = 32,
  channel,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  channel?: Channel;
}) {
  const [imgError, setImgError] = React.useState(false);
  React.useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  if (avatarUrl && !imgError) {
    return (
      <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
        <img
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            flexShrink: 0,
            background: "var(--bg-overlay)",
          }}
          onError={() => setImgError(true)}
        />
        <ChannelBadge channel={channel} size={size} />
      </span>
    );
  }

  const ini = initials(name);
  return (
    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <div
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: nameToColor(name || "?"),
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.37),
          fontWeight: 600,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {ini}
      </div>
      <ChannelBadge channel={channel} size={size} />
    </span>
  );
}
