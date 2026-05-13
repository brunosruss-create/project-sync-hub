import { createFileRoute } from "@tanstack/react-router";
import { evo, extractQRCode, normalizeQRCodeImage } from "@/lib/evolution.server";

export const Route = createFileRoute("/api/public/evolution-connect-test")({
  server: {
    handlers: {
      GET: async () => {
        const name = "zapflow_main";
        const result: any = { steps: [] };
        try {
          const raw = await evo.connect(name);
          result.steps.push({ step: "evo.connect ok", keys: Object.keys(raw ?? {}) });
          const extracted = extractQRCode(raw);
          result.steps.push({ step: "extractQRCode", hasValue: !!extracted, prefix: extracted?.slice(0, 40) });
          const normalized = await normalizeQRCodeImage(extracted);
          result.steps.push({ step: "normalize", hasValue: !!normalized, prefix: normalized?.slice(0, 40), length: normalized?.length });
          result.qr = normalized;
        } catch (e: any) {
          result.error = String(e?.message ?? e);
        }
        return Response.json(result);
      },
    },
  },
});
