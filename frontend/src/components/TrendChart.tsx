import { useId, useMemo, useState } from "react";
import type { LabStatus, LabTrend } from "../lib/types";
import { formatDate } from "../lib/format";

const W = 560;
const H = 200;
const M = { l: 48, r: 56, t: 14, b: 30 };
const LINE = "#0d9488"; // brand-600: the single series
const BAND = "#f0fdfa"; // brand-50: typical range
const BAND_EDGE = "#99f6e4"; // brand-200
const GRID = "#e2e8f0"; // slate-200
const INK_MUTED = "#64748b"; // slate-500
const INK = "#334155"; // slate-700

export const STATUS_TEXT: Record<LabStatus, string> = {
  normal: "In range", low: "Low", high: "High", critical_low: "Critically low", critical_high: "Critically high",
};

function fmt(v: number): string {
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100);
}

/** 3-5 round tick values; the domain is widened to whole steps so the ends are labelled. */
function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });

export default function TrendChart({ trend }: { trend: LabTrend }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const unit = trend.unit === "%" ? "%" : ` ${trend.unit}`;

  const g = useMemo(() => {
    const pts = trend.points;
    const times = pts.map((p) => new Date(p.date + "T00:00:00").getTime());
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const vals = pts.map((p) => p.value);
    const limits = [trend.ref_low, trend.ref_high].filter((v): v is number => v !== null);
    let lo = Math.min(...vals, ...limits);
    let hi = Math.max(...vals, ...limits);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.1;
    const ticks = niceTicks(Math.max(0, lo - pad), hi + pad);
    lo = ticks[0];
    hi = ticks[ticks.length - 1];
    const iw = W - M.l - M.r;
    const ih = H - M.t - M.b;
    const x = (t: number) => (t1 === t0 ? M.l + iw / 2 : M.l + ((t - t0) / (t1 - t0)) * iw);
    const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * ih;
    const xy = pts.map((p, i) => ({ ...p, cx: x(times[i]), cy: y(p.value) }));
    const bandTop = trend.ref_high !== null ? y(trend.ref_high) : M.t;
    const bandBottom = trend.ref_low !== null ? y(trend.ref_low) : M.t + ih;
    // hit columns: halfway to each neighbour, so targets are much wider than the 9px markers
    const cols = xy.map((p, i) => {
      const left = i === 0 ? M.l : (xy[i - 1].cx + p.cx) / 2;
      const right = i === xy.length - 1 ? W - M.r : (p.cx + xy[i + 1].cx) / 2;
      return { left, width: Math.max(right - left, 12) };
    });
    return { xy, ticks, y, bandTop, bandBottom, ih, cols };
  }, [trend]);

  const showEvery = g.xy.length <= 6;
  const a = active !== null ? g.xy[active] : null;
  const last = g.xy[g.xy.length - 1];

  return (
    <div>
      <div className="relative" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-labelledby={titleId}>
          <title id={titleId}>{trend.summary}</title>
          {(trend.ref_low !== null || trend.ref_high !== null) && (
            <g>
              <rect x={M.l} y={g.bandTop} width={W - M.l - M.r} height={Math.max(g.bandBottom - g.bandTop, 0)} fill={BAND} />
              {trend.ref_high !== null && <line x1={M.l} x2={W - M.r} y1={g.bandTop} y2={g.bandTop} stroke={BAND_EDGE} strokeWidth={1} />}
              {trend.ref_low !== null && <line x1={M.l} x2={W - M.r} y1={g.bandBottom} y2={g.bandBottom} stroke={BAND_EDGE} strokeWidth={1} />}
              <text x={M.l + 6} y={Math.max(g.bandTop, M.t) + 13} fontSize={11} fill={INK_MUTED}>Typical range</text>
            </g>
          )}
          {g.ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={W - M.r} y1={g.y(t)} y2={g.y(t)} stroke={GRID} strokeWidth={1} strokeDasharray="2 3" />
              <text x={M.l - 8} y={g.y(t) + 4} fontSize={11} textAnchor="end" fill={INK_MUTED} className="tabular-nums">{fmt(t)}</text>
            </g>
          ))}
          {g.xy.map((p, i) => (showEvery || i === 0 || i === g.xy.length - 1) && (
            <text key={p.date} x={p.cx} y={H - 8} fontSize={11} textAnchor={g.xy.length === 1 ? "middle" : i === 0 ? "start" : i === g.xy.length - 1 ? "end" : "middle"} fill={INK_MUTED}>
              {shortDate(p.date)}
            </text>
          ))}
          {a && <line x1={a.cx} x2={a.cx} y1={M.t} y2={M.t + g.ih} stroke="#cbd5e1" strokeWidth={1} />}
          <polyline points={g.xy.map((p) => `${p.cx},${p.cy}`).join(" ")} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {g.xy.map((p, i) => (
            <circle key={p.date} cx={p.cx} cy={p.cy} r={active === i ? 6 : 4.5} fill={LINE} stroke="#fff" strokeWidth={2} />
          ))}
          {/* selective direct label: the latest value only */}
          <text x={last.cx + 10} y={last.cy + 4} fontSize={12} fontWeight={600} fill={INK} className="tabular-nums">{fmt(last.value)}{trend.unit === "%" ? "%" : ""}</text>
          {g.xy.map((p, i) => (
            <rect
              key={p.date} x={g.cols[i].left} y={M.t} width={g.cols[i].width} height={g.ih} fill="transparent"
              tabIndex={0} role="button" aria-label={`${formatDate(p.date)}: ${fmt(p.value)}${unit}, ${STATUS_TEXT[p.status]}`}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              className="cursor-crosshair outline-none"
            />
          ))}
        </svg>
        {a && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md"
            style={{ left: `${(a.cx / W) * 100}%`, top: `${(a.cy / H) * 100}%`, marginTop: -10 }}
          >
            <div className="text-slate-500">{formatDate(a.date)}</div>
            <div className="font-semibold tabular-nums text-slate-900">{fmt(a.value)}{unit}</div>
            <div className="text-slate-600">{STATUS_TEXT[a.status]}</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900">Show values as a table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Date</th><th className="py-1 font-medium">Value</th><th className="py-1 font-medium">Status</th></tr></thead>
          <tbody>
            {trend.points.map((p) => (
              <tr key={p.date} className="border-t border-slate-100">
                <td className="py-1">{formatDate(p.date)}</td>
                <td className="py-1 tabular-nums">{fmt(p.value)}{unit}</td>
                <td className="py-1">{STATUS_TEXT[p.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
