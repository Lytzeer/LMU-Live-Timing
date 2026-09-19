import type { SessionState } from "../types/session";

const SESSION_NAMES: Record<number, string> = {
  0: "Test Day",
  1: "Practice 1",
  2: "Practice 2",
  3: "Practice 3",
  4: "Practice 4",
  5: "Qualifying 1",
  6: "Qualifying 2",
  7: "Qualifying 3",
  8: "Qualifying 4",
  9: "Warmup",
  10: "Race 1",
  11: "Race 2",
  12: "Race 3",
  13: "Race 4",
};

function sessionName(sessionType: number): string {
  return SESSION_NAMES[sessionType] ?? "Session";
}

function sessionCategoryColor(sessionType: number): { bg: string; text: string } {
  if (sessionType >= 10) return { bg: "#e10600", text: "#ffffff" }; // Race
  if (sessionType >= 5) return { bg: "#ffd60a", text: "#080b1e" }; // Qualifying
  return { bg: "#4c8fd4", text: "#ffffff" }; // Practice / Warmup / Test Day
}

const GAME_PHASE_STATUS: Record<number, { label: string; color: string }> = {
  0: { label: "Garage", color: "#6d76ad" },
  1: { label: "Reconnaissance", color: "#6d76ad" },
  2: { label: "Grid Walk", color: "#6d76ad" },
  3: { label: "Formation Lap", color: "#ffd60a" },
  4: { label: "Countdown", color: "#ffd60a" },
  5: { label: "Green Flag", color: "#3ddc84" },
  6: { label: "Full Course Yellow", color: "#ffd60a" },
  7: { label: "Session Stopped", color: "#ff3b30" },
  8: { label: "Session Over", color: "#eef1f5" },
  9: { label: "Paused", color: "#6d76ad" },
};

function FlagStatus({ gamePhase }: Readonly<{ gamePhase: number }>) {
  const status = GAME_PHASE_STATUS[gamePhase] ?? { label: "Unknown", color: "#6d76ad" };
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ backgroundColor: status.color, boxShadow: `0 0 8px ${status.color}` }}
      />
      <span className="font-['Titillium_Web'] text-[12px] font-bold italic uppercase tracking-wide text-[#eef1f5]">
        {status.label}
      </span>
    </span>
  );
}

function SectorFlags({ flags }: Readonly<{ flags: number[] }>) {
  return (
    <span className="flex items-center gap-1.5">
      {flags.map((f, i) => {
        const active = f !== 0;
        return (
          <span
            key={i}
            className="flex items-center justify-center w-6 h-5 rounded-sm text-[10px] font-['Titillium_Web'] font-black italic"
            style={{
              backgroundColor: active ? "#ffd60a" : "#1a2050",
              color: active ? "#080b1e" : "#5c6491",
            }}
            title={`Secteur ${i + 1}${active ? " — drapeau jaune local" : ""}`}
          >
            S{i + 1}
          </span>
        );
      })}
    </span>
  );
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const YOUTUBE_ID_RE =
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/;

function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(YOUTUBE_ID_RE);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

const STREAM_VIDEO_ID = extractYoutubeId(import.meta.env.VITE_YOUTUBE_STREAM ?? "");

function StreamPanel() {
  return (
    <div className="flex flex-col bg-[#0c1128] rounded-lg border border-[#232c5c] overflow-hidden h-full">
      {STREAM_VIDEO_ID ? (
        <div className="relative w-full aspect-video">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${STREAM_VIDEO_ID}?autoplay=1&mute=1`}
            title="POV stream"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#6d76ad] px-4 py-8 text-center">
          Aucun stream configuré
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] font-['Titillium_Web'] font-bold italic uppercase tracking-wide text-[#6d76ad]">
        {label}
      </span>
      <span className="font-['JetBrains_Mono'] text-[13px] text-[#eef1f5] tabular-nums">{value}</span>
    </div>
  );
}

function InfoPanel({ data, connected }: Readonly<{ data: SessionState | null; connected: boolean }>) {
  if (!connected || !data) {
    return (
      <div className="flex flex-col bg-[#0c1128] rounded-lg border border-[#232c5c] p-4 h-full justify-center">
        <p className="font-['Inter'] text-[13px] font-medium text-[#ff3b30]">🔴 Déconnecté</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 bg-[#0c1128] rounded-lg border border-[#232c5c] overflow-hidden h-full">
      <div className="flex items-center justify-between">
        <div
          className="-skew-x-12 -mx-6 px-8 py-1.5 w-fit"
          style={{ backgroundColor: sessionCategoryColor(data.session_type).bg }}
        >
          <span
            className="inline-block skew-x-12 text-[11px] font-['Titillium_Web'] font-black italic uppercase tracking-widest"
            style={{ color: sessionCategoryColor(data.session_type).text }}
          >
            {sessionName(data.session_type)}
          </span>
        </div>
        <div className="flex items-center gap-4 mr-4">
          <SectorFlags flags={data.sector_flags} />
          <FlagStatus gamePhase={data.game_phase} />
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div>
          <p className="font-['Titillium_Web'] text-[28px] leading-[1.2] tracking-normal font-black italic uppercase text-[#eef1f5] break-words">
            {data.track}
          </p>
          <div className="font-['JetBrains_Mono'] text-[32px] font-bold text-white tabular-nums leading-none mt-1">
            {formatDuration(data.time_remaining)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <InfoRow label="Météo" value={`${Math.round(data.raining * 100)}% pluie`} />
          <InfoRow label="Température piste" value={`${data.track_temp.toFixed(1)}°C`} />
        </div>
      </div>
    </div>
  );
}

export default function SessionHeader({
  data,
  connected,
}: Readonly<{ data: SessionState | null; connected: boolean }>) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <InfoPanel data={data} connected={connected} />
      <StreamPanel />
    </div>
  );
}
