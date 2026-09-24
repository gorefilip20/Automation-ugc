import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleDashed } from "lucide-react";

/** Shows which generation engines this install has keys for. */
export default function EngineStatus({ only }: { only?: Array<"script" | "voice" | "avatar" | "images" | "transcription" | "downloads"> }) {
  const caps = trpc.video.capabilities.useQuery().data;
  if (!caps) return null;
  const rows = [
    { key: "script", label: "Script writer", value: caps.scriptWriter === "claude" ? "Claude" : null, off: "Built-in templates (set ANTHROPIC_API_KEY)" },
    { key: "voice", label: "Voiceover", value: caps.voiceover, off: "Silent + captions (set ELEVENLABS_API_KEY or OPENAI_API_KEY)" },
    { key: "avatar", label: "Talking avatar", value: caps.talkingAvatar, off: "Off (set HEYGEN_API_KEY + HEYGEN_VOICE_ID or DID_API_KEY)" },
    { key: "images", label: "AI images", value: caps.imageGeneration, off: "Uploads + text cards (set OPENAI_API_KEY)" },
    { key: "transcription", label: "Transcription", value: caps.transcription, off: "Loudness picking, no captions (set OPENAI_API_KEY)" },
    { key: "downloads", label: "Video links", value: caps.urlDownloads, off: "" },
  ].filter((r) => !only || only.includes(r.key as any));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", border: "1px solid #e5e0d7", background: "#fbfaf6" }}>
          {r.value ? <CheckCircle2 size={14} style={{ color: "#5ca679", flexShrink: 0, marginTop: 1 }} /> : <CircleDashed size={14} style={{ color: "#b9754d", flexShrink: 0, marginTop: 1 }} />}
          <div>
            <strong style={{ display: "block", fontSize: 10 }}>{r.label}</strong>
            <span style={{ fontSize: 9, color: "#8c94a1" }}>{r.value ? String(r.value) : r.off}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
