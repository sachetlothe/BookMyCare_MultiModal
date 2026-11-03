import { motion } from "motion/react";
import { AlertTriangle, ArrowDown, ArrowUp, Check } from "lucide-react";
import { rangeText } from "../lib/format";
import { ZONE_STYLE, buildMeter, simpleInfo, simpleSummary, zoneOf } from "../lib/simpleLabs";
import type { LabValue } from "../lib/types";
import { cx } from "./ui";

function ZoneIcon({ zone }: { zone: "low" | "normal" | "high" }) {
  const Icon = zone === "low" ? ArrowDown : zone === "high" ? ArrowUp : Check;
  return <Icon className="h-3.5 w-3.5" aria-hidden />;
}

function SimpleLabCard({ lab, index }: { lab: LabValue; index: number }) {
  const info = simpleInfo(lab.key);
  const zone = zoneOf(lab.status);
  const critical = lab.status.startsWith("critical");
  const meter = buildMeter(lab.value, lab.ref_low, lab.ref_high);
  const note = zone === "low" ? info.low : zone === "high" ? info.high : null;
  const Icon = info.icon;
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0.15, visualDuration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`simple-lab-${lab.key}`}
    >
      <div className="flex items-start gap-3">
        <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-inner", info.tint)}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div>
              <p className="font-semibold text-slate-900">{lab.test}</p>
              <p className="text-xs font-medium text-slate-500">{info.nickname}</p>
            </div>
            <p className="font-mono text-lg font-semibold text-slate-900">
              {lab.value} <span className="text-xs font-normal text-slate-500">{lab.unit}</span>
            </p>
          </div>
        </div>
      </div>

      {meter ? (
        <div className="mt-4" aria-hidden>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {meter.segments.map((s) => (
              <div key={s.zone} className={cx("absolute inset-y-0", ZONE_STYLE[s.zone].bar)} style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%` }} />
            ))}
          </div>
          <div className="relative h-4">
            <motion.div
              className="absolute -top-[18px] -ml-2 h-0 w-0 border-x-8 border-t-[10px] border-x-transparent border-t-slate-800 drop-shadow"
              initial={{ left: "50%" }}
              animate={{ left: `${meter.position * 100}%` }}
              transition={{ type: "spring", bounce: 0.2, visualDuration: 0.6 }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Low</span><span>Typical: {rangeText(lab.ref_low, lab.ref_high)}</span><span>High</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No reference range was available for this value, so no meter is shown.</p>
      )}

      <p className={cx("mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", critical ? "bg-red-50 text-red-700 ring-red-200" : ZONE_STYLE[zone].chip)}>
        {critical ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <ZoneIcon zone={zone} />}
        {critical ? "Far outside the typical range - please contact your doctor today" : ZONE_STYLE[zone].label}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{info.what}</p>
      {note && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">{note}</p>}
    </motion.li>
  );
}

export default function SimpleLabView({ labs }: { labs: LabValue[] }) {
  if (!labs.length) return <p className="text-sm text-slate-500">No lab values were recognised.</p>;
  const sorted = [...labs].sort((a, b) => Number(a.status === "normal") - Number(b.status === "normal"));
  const s = simpleSummary(labs);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
        <p className="font-semibold text-slate-900">
          {s.inRange} of {labs.length} {labs.length === 1 ? "value is" : "values are"} within the typical range
          {s.outside > 0 && <>, and {s.outside} {s.outside === 1 ? "needs" : "need"} a closer look with your doctor</>}.
        </p>
        {s.critical > 0 && <p className="mt-1 font-medium text-red-700">{s.critical} {s.critical === 1 ? "value is" : "values are"} far outside the typical range. Please contact your doctor today.</p>}
        <p className="mt-1 text-xs text-slate-500">Colours and arrows compare each value with the reference range shown. A value outside the range is not a diagnosis - only a doctor can say what it means for you.</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2">
        {sorted.map((l, i) => <SimpleLabCard key={l.key} lab={l} index={i} />)}
      </ul>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500" aria-label="Colour key">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-rose-300" /> Low</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-emerald-300" /> Typical</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-orange-300" /> High</span>
        <span>Generic adult ranges, adjusted for your sex when known. The range printed on your own report takes precedence.</span>
      </div>
    </div>
  );
}
