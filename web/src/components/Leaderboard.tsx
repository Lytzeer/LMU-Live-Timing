import { useState, useMemo } from "react";
import type { DriverInfo } from "../types/session";
import { useImproved, usePositionChange, type PositionDelta } from "../hooks/useFlash";

type Tab = "lap" | "sector";

const CLASS_COLORS: Record<string, string> = {
  // Mock server values
  LMH: "#e10600",
  LMP2: "#4c8fd4",
  LMGT3: "#4cd48f",
  // Real LMU telemetry values (mVehicleClass)
  HYPERCAR: "#e10600",
  LMP2_ELMS: "#4c8fd4",
  LMP3: "#c084fc",
  GT3: "#4cd48f",
  GTE: "#ff8a3d",
  PACECAR: "#6b7480",
};

function classColor(vehicleClass: string): string {
  const key = vehicleClass.toUpperCase();
  if (CLASS_COLORS[key]) return CLASS_COLORS[key];
  if (key.includes("HYPER") || key === "LMH" || key === "LMDH") return "#e10600";
  if (key.includes("LMP2")) return "#4c8fd4";
  if (key.includes("LMP3")) return "#c084fc";
  if (key.includes("GT3")) return "#4cd48f";
  if (key.includes("GTE")) return "#ff8a3d";
  if (key.includes("PACE")) return "#6b7480";
  return "#6b7480";
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "--";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : `${s}s`;
}

function formatSector(seconds: number | null): string {
  if (seconds === null) return "--";
  return seconds.toFixed(3);
}

function formatGap(gap: number | null, lapsBehind: number): string {
  if (lapsBehind > 0) return `+${lapsBehind} ${lapsBehind > 1 ? "Tours" : "Tour"}`;
  if (gap === null) return "LEADER";
  return `+${gap.toFixed(3)}`;
}

interface Interval {
  gap: number | null;
  laps: number;
}

function formatInterval({ gap, laps }: Interval): string {
  if (laps > 0) return `+${laps} ${laps > 1 ? "Tours" : "Tour"}`;
  if (gap === null) return "--";
  return `+${gap.toFixed(3)}`;
}

function computeIntervals(list: DriverInfo[]): Interval[] {
  return list.map((d, i) => {
    if (i === 0) return { gap: null, laps: 0 };
    const prev = list[i - 1];
    const lapsDiff = d.laps_behind_leader - prev.laps_behind_leader;
    if (lapsDiff > 0) return { gap: null, laps: lapsDiff };
    if (d.gap_to_leader === null || prev.gap_to_leader === null) return { gap: null, laps: 0 };
    return { gap: d.gap_to_leader - prev.gap_to_leader, laps: 0 };
  });
}

function fuelColor(fraction: number): string {
  if (fraction > 0.3) return "#3ddc84";
  if (fraction > 0.1) return "#f59e0b";
  return "#ff3b30";
}

interface LeaderboardProps {
  drivers: DriverInfo[];
}

function FuelGauge({ fraction }: Readonly<{ fraction: number }>) {
  const color = fuelColor(fraction);
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="flex flex-col items-center justify-center gap-0.5">
      <div className="relative w-[5px] h-[28px] bg-[#1e2530] rounded-full overflow-hidden flex flex-col justify-end">
        <div
          className="w-full rounded-full transition-all duration-500"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="font-['JetBrains_Mono'] text-[9px] tabular-nums leading-none"
        style={{ color }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

function ClassBadge({ vehicleClass }: Readonly<{ vehicleClass: string }>) {
  const color = classColor(vehicleClass);
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded-sm text-[9px] font-bold italic tracking-wide font-['Titillium_Web'] uppercase"
      style={{ color, backgroundColor: `${color}26`, border: `1px solid ${color}66` }}
    >
      {vehicleClass}
    </span>
  );
}

function DriverCell({ d }: Readonly<{ d: DriverInfo }>) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <ClassBadge vehicleClass={d.vehicle_class} />
      <span className="font-['Inter'] text-[13px] font-medium text-[#eef1f5] truncate">
        {d.name}
        {d.is_player && (
          <span className="ml-2 text-[10px] text-[#3ddc84] font-bold tracking-wider">YOU</span>
        )}
      </span>
    </span>
  );
}

function PositionCell({
  position,
  classPosition,
  flashing,
  direction,
}: Readonly<{ position: number; classPosition?: number } & PositionDelta>) {
  return (
    <span className="relative flex items-center gap-1 font-['Titillium_Web'] italic text-[16px] font-black text-[#eef1f5] tabular-nums">
      {classPosition ?? position}
      {classPosition !== undefined && (
        <span className="text-[10px] font-bold not-italic text-[#6d76ad]">P{position}</span>
      )}
      {flashing && direction && (
        <span
          className="pop-fade text-[10px] leading-none"
          style={{ color: direction === "up" ? "#3ddc84" : "#ff3b30" }}
        >
          {direction === "up" ? "▲" : "▼"}
        </span>
      )}
    </span>
  );
}

function BestLapCell({
  bestLap,
  isOverallBest,
  isNewRecord,
}: Readonly<{ bestLap: number | null; isOverallBest: boolean; isNewRecord: boolean }>) {
  const personalBest = useImproved(bestLap);
  const flashClass = isNewRecord || personalBest ? "flash-gold" : "";
  return (
    <span
      className={`font-['JetBrains_Mono'] text-right text-[13px] tabular-nums px-1 rounded ${flashClass}`}
      style={{
        color: isOverallBest ? "#c084fc" : "#eef1f5",
        backgroundColor: isOverallBest ? "rgba(192, 132, 252, 0.1)" : undefined,
      }}
    >
      {formatTime(bestLap)}
    </span>
  );
}

function SectorCell({ time, isBest }: Readonly<{ time: number | null; isBest: boolean }>) {
  return (
    <span
      className="text-right text-[13px] tabular-nums font-['JetBrains_Mono'] px-1 rounded"
      style={{
        color: isBest ? "#c084fc" : "#eef1f5",
        backgroundColor: isBest ? "rgba(192, 132, 252, 0.1)" : "transparent",
      }}
    >
      {formatSector(time)}
    </span>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: "lap", label: "LAP" },
  { key: "sector", label: "SECTOR" },
];

function groupByVehicleClass(drivers: DriverInfo[]): { className: string; drivers: DriverInfo[] }[] {
  const groups = new Map<string, DriverInfo[]>();
  for (const d of drivers) {
    const key = d.vehicle_class;
    const list = groups.get(key);
    if (list) list.push(d);
    else groups.set(key, [d]);
  }
  return Array.from(groups.entries())
    .map(([className, list]) => ({
      className,
      drivers: [...list].sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.drivers[0].position - b.drivers[0].position);
}

function ClassGroupHeader({ className }: Readonly<{ className: string }>) {
  const color = classColor(className);
  return (
    <div className="px-3 py-1.5" style={{ backgroundColor: `${color}1f` }}>
      <span
        className="inline-block -skew-x-12 px-3 py-0.5"
        style={{ backgroundColor: color }}
      >
        <span className="inline-block skew-x-12 text-[11px] font-['Titillium_Web'] font-black italic uppercase tracking-widest text-[#080b1e]">
          {className}
        </span>
      </span>
    </div>
  );
}

function LapRow({
  d,
  index,
  classPosition,
  interval,
  isOverallBest,
  isNewRecord,
}: Readonly<{
  d: DriverInfo;
  index: number;
  classPosition?: number;
  interval: Interval;
  isOverallBest: boolean;
  isNewRecord: boolean;
}>) {
  const { flashing, direction } = usePositionChange(d.position);
  const rowFlash = flashing ? (direction === "up" ? "flash-green" : "flash-red") : "";

  return (
    <div
      className={`grid grid-cols-[40px_minmax(150px,1fr)_100px_80px_80px_90px_40px_40px] gap-2 px-3 py-1.5 items-center border-l-[3px] ${rowFlash}`}
      style={{
        borderLeftColor: classColor(d.vehicle_class),
        backgroundColor: index % 2 === 0 ? "#131a3d" : "#0e1330",
      }}
    >
      <PositionCell
        position={d.position}
        classPosition={classPosition}
        flashing={flashing}
        direction={direction}
      />
      <DriverCell d={d} />
      <BestLapCell bestLap={d.best_lap} isOverallBest={isOverallBest} isNewRecord={isNewRecord} />
      <span
        className="font-['JetBrains_Mono'] text-right text-[13px] tabular-nums"
        style={{ color: d.gap_to_leader === null ? "#3ddc84" : "#eef1f5" }}
      >
        {formatGap(d.gap_to_leader, d.laps_behind_leader)}
      </span>
      <span className="font-['JetBrains_Mono'] text-right text-[13px] text-[#6d76ad] tabular-nums">
        {formatInterval(interval)}
      </span>
      <span className="font-['JetBrains_Mono'] text-right text-[13px] text-[#6b7480] tabular-nums">
        {formatTime(d.last_lap)}
      </span>
      <div className="flex justify-center">
        <FuelGauge fraction={d.fuel_fraction} />
      </div>
      <span className="text-right">
        {d.in_pit ? (
          <span className="inline-block px-2 py-0.5 -skew-x-12 text-[10px] font-black italic bg-[#e10600] text-white tracking-wider font-['Titillium_Web'] uppercase">
            <span className="inline-block skew-x-12">PIT</span>
          </span>
        ) : (
          <span className="font-['JetBrains_Mono'] text-[12px] text-[#6b7480] tabular-nums">
            {d.num_pitstops}
          </span>
        )}
      </span>
    </div>
  );
}

function SectorRow({
  d,
  index,
  classPosition,
  bestS1,
  bestS2,
  bestS3,
}: Readonly<{
  d: DriverInfo;
  index: number;
  classPosition?: number;
  bestS1: number;
  bestS2: number;
  bestS3: number;
}>) {
  const { flashing, direction } = usePositionChange(d.position);
  const rowFlash = flashing ? (direction === "up" ? "flash-green" : "flash-red") : "";

  return (
    <div
      className={`grid grid-cols-[40px_minmax(150px,1fr)_90px_90px_90px_100px_40px] gap-2 px-3 py-1.5 items-center border-l-[3px] ${rowFlash}`}
      style={{
        borderLeftColor: classColor(d.vehicle_class),
        backgroundColor: index % 2 === 0 ? "#131a3d" : "#0e1330",
      }}
    >
      <PositionCell
        position={d.position}
        classPosition={classPosition}
        flashing={flashing}
        direction={direction}
      />
      <DriverCell d={d} />
      <SectorCell time={d.best_s1} isBest={d.best_s1 !== null && d.best_s1 === bestS1} />
      <SectorCell time={d.best_s2} isBest={d.best_s2 !== null && d.best_s2 === bestS2} />
      <SectorCell time={d.best_s3} isBest={d.best_s3 !== null && d.best_s3 === bestS3} />
      <span className="font-['JetBrains_Mono'] text-right text-[13px] text-[#eef1f5] tabular-nums">
        {formatTime(d.best_lap)}
      </span>
      <div className="flex justify-center">
        <FuelGauge fraction={d.fuel_fraction} />
      </div>
    </div>
  );
}

export default function Leaderboard({ drivers }: Readonly<LeaderboardProps>) {
  const [tab, setTab] = useState<Tab>("lap");
  const [groupByClass, setGroupByClass] = useState(false);

  const groups = useMemo(
    () => (groupByClass ? groupByVehicleClass(drivers) : null),
    [groupByClass, drivers],
  );

  const intervals = useMemo(() => computeIntervals(drivers), [drivers]);
  const groupIntervals = useMemo(
    () => groups?.map((g) => computeIntervals(g.drivers)) ?? null,
    [groups],
  );

  const bestS1 = useMemo(
    () => Math.min(...drivers.filter((d) => d.best_s1 !== null).map((d) => d.best_s1!)),
    [drivers],
  );
  const bestS2 = useMemo(
    () => Math.min(...drivers.filter((d) => d.best_s2 !== null).map((d) => d.best_s2!)),
    [drivers],
  );
  const bestS3 = useMemo(
    () => Math.min(...drivers.filter((d) => d.best_s3 !== null).map((d) => d.best_s3!)),
    [drivers],
  );
  const bestLapOverall = useMemo(() => {
    const laps = drivers.filter((d) => d.best_lap !== null).map((d) => d.best_lap!);
    return laps.length > 0 ? Math.min(...laps) : null;
  }, [drivers]);
  const isNewRecord = useImproved(bestLapOverall);

  return (
    <div className="bg-[#0c1128] font-['Inter'] rounded-lg overflow-hidden border border-[#232c5c] shadow-[0_0_0_1px_rgba(0,0,0,0.3)]">
      {/* Tab bar */}
      <div className="flex items-center justify-between bg-[#080b1e] border-b border-[#232c5c]">
        <div className="flex">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="relative px-6 py-2.5 -skew-x-12 text-[12px] font-black italic uppercase tracking-widest transition-colors cursor-pointer"
              style={{
                color: tab === t.key ? "#ffffff" : "#5c6491",
                backgroundColor: tab === t.key ? "#e10600" : "transparent",
              }}
            >
              <span className="inline-block skew-x-12">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setGroupByClass((v) => !v)}
          className="mr-3 -skew-x-12 px-3 py-1 text-[10px] font-black italic uppercase tracking-widest border transition-colors cursor-pointer"
          style={{
            color: groupByClass ? "#ffffff" : "#5c6491",
            backgroundColor: groupByClass ? "#e10600" : "transparent",
            borderColor: groupByClass ? "#e10600" : "#232c5c",
          }}
        >
          <span className="inline-block skew-x-12">By Class</span>
        </button>
      </div>

      {/* LAP */}
      {tab === "lap" && (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[40px_minmax(150px,1fr)_100px_80px_80px_90px_40px_40px] gap-2 px-3 py-2 text-[11px] font-['Titillium_Web'] font-bold italic uppercase tracking-wide text-[#6d76ad] border-b border-[#232c5c]">
              <span>Pos</span>
              <span>Driver</span>
              <span className="text-right">Best</span>
              <span className="text-right">Gap</span>
              <span className="text-right">Int</span>
              <span className="text-right">Last</span>
              <span className="text-center">Fuel</span>
              <span className="text-right">Pit</span>
            </div>
            {groups
              ? groups.map((g, gi) => (
                  <div key={g.className}>
                    <ClassGroupHeader className={g.className} />
                    {g.drivers.map((d, i) => (
                      <LapRow
                        key={d.id}
                        d={d}
                        index={i}
                        classPosition={i + 1}
                        interval={groupIntervals![gi][i]}
                        isOverallBest={bestLapOverall !== null && d.best_lap === bestLapOverall}
                        isNewRecord={
                          isNewRecord && bestLapOverall !== null && d.best_lap === bestLapOverall
                        }
                      />
                    ))}
                  </div>
                ))
              : drivers.map((d, i) => (
                  <LapRow
                    key={d.id}
                    d={d}
                    index={i}
                    interval={intervals[i]}
                    isOverallBest={bestLapOverall !== null && d.best_lap === bestLapOverall}
                    isNewRecord={isNewRecord && bestLapOverall !== null && d.best_lap === bestLapOverall}
                  />
                ))}
          </div>
        </div>
      )}

      {/* SECTOR */}
      {tab === "sector" && (
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[40px_minmax(150px,1fr)_90px_90px_90px_100px_40px] gap-2 px-3 py-2 text-[11px] font-['Titillium_Web'] font-bold italic uppercase tracking-wide text-[#6d76ad] border-b border-[#232c5c]">
              <span>Pos</span>
              <span>Driver</span>
              <span className="text-right">S1</span>
              <span className="text-right">S2</span>
              <span className="text-right">S3</span>
              <span className="text-right">Best Lap</span>
              <span className="text-center">Fuel</span>
            </div>
            {groups
              ? groups.map((g) => (
                  <div key={g.className}>
                    <ClassGroupHeader className={g.className} />
                    {g.drivers.map((d, i) => (
                      <SectorRow
                        key={d.id}
                        d={d}
                        index={i}
                        classPosition={i + 1}
                        bestS1={bestS1}
                        bestS2={bestS2}
                        bestS3={bestS3}
                      />
                    ))}
                  </div>
                ))
              : drivers.map((d, i) => (
                  <SectorRow key={d.id} d={d} index={i} bestS1={bestS1} bestS2={bestS2} bestS3={bestS3} />
                ))}
            <div className="px-3 py-2 flex items-center gap-2 border-t border-[#232c5c]">
              <span className="inline-block w-2 h-2 rounded-sm bg-[#c084fc]/20 border border-[#c084fc]" />
              <span className="text-[10px] text-[#6d76ad] uppercase tracking-wide">Best sector overall</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
