import { AnimatePresence, motion, type MotionValue } from "motion/react";
import { Bandage, CalendarCheck, Check, Droplet, Footprints, Gauge, Salad, ShieldCheck, Stethoscope, Truck } from "lucide-react";
import { cx } from "../ui";

export type ReportVariant = "hero" | "complex" | "upload" | "analysis" | "simple" | "screening" | "plan";

const SAMPLE_ROWS = [
  { name: "Hemoglobin", value: "11.2", unit: "g/dL", range: "12.0 – 15.5", flag: "L" },
  { name: "WBC count", value: "7.8", unit: "×10³/µL", range: "4.0 – 11.0", flag: "" },
  { name: "Platelets", value: "245", unit: "×10³/µL", range: "150 – 450", flag: "" },
  { name: "RBC count", value: "4.6", unit: "×10⁶/µL", range: "4.2 – 5.4", flag: "" },
];
const JARGON_ROWS = [
  ["MCV", "76.4", "fL", "80–100", "L"], ["MCH", "24.9", "pg", "27–33", "L"], ["MCHC", "30.1", "g/dL", "32–36", "L"],
  ["RDW-CV", "16.8", "%", "11.5–14.5", "H"], ["Neutrophils", "62", "%", "40–75", ""], ["Lymphocytes", "29", "%", "20–45", ""],
  ["Eosinophils", "6.2", "%", "1–6", "H"], ["MPV", "10.1", "fL", "7.5–11.5", ""], ["Hematocrit", "34.8", "%", "36–46", "L"],
];

function Header({ title, tag }: { title: string; tag: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-red-600 text-white shadow-md shadow-rose-500/30">
          <Droplet className="h-5 w-5" fill="currentColor" aria-hidden />
        </span>
        <div>
          <p className="text-[13px] font-bold leading-tight text-slate-900">{title}</p>
          <p className="text-[10px] text-slate-400">BookMyCare · Lab report</p>
        </div>
      </div>
      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-700 ring-1 ring-sky-200">{tag}</span>
    </div>
  );
}

const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.28 } };

function Body({ variant }: { variant: ReportVariant }) {
  if (variant === "complex") {
    return (
      <motion.div key="complex" {...fade}>
        <Header title="Haematology Profile" tag="Sample" />
        <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-x-2 gap-y-1 font-mono text-[10px] text-slate-500">
          {JARGON_ROWS.map(([n, v, u, r, f]) => (
            <div key={n} className="contents">
              <span className="truncate text-slate-700">{n}</span>
              <span className={cx("text-right font-semibold", f === "L" && "text-sky-700", f === "H" && "text-orange-600")}>{v}{f && <sup>{f}</sup>}</span>
              <span>{u}</span><span className="text-slate-400">{r}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5" aria-hidden>
          {[92, 70, 84].map((w) => <div key={w} className="h-1.5 rounded bg-slate-100" style={{ width: `${w}%` }} />)}
        </div>
      </motion.div>
    );
  }
  if (variant === "simple") {
    const items = [
      { icon: Truck, name: "Hemoglobin", nick: "Oxygen delivery trucks", tint: "bg-rose-50 text-rose-600", pos: 0.3 },
      { icon: ShieldCheck, name: "White blood cells", nick: "Security guards", tint: "bg-sky-50 text-sky-600", pos: 0.5 },
      { icon: Bandage, name: "Platelets", nick: "Tiny repair helpers", tint: "bg-amber-50 text-amber-600", pos: 0.45 },
    ];
    return (
      <motion.div key="simple" {...fade}>
        <Header title="Your report, simplified" tag="Simple mode" />
        <ul className="mt-3 space-y-2.5">
          {items.map((it, i) => (
            <motion.li key={it.name} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
              className="rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
              <div className="flex items-center gap-2.5">
                <span className={cx("flex h-8 w-8 items-center justify-center rounded-lg", it.tint)}><it.icon className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-slate-800">{it.name}</p>
                  <p className="text-[10px] text-slate-500">{it.nick}</p>
                </div>
              </div>
              <div className="relative mt-2 flex h-1.5 overflow-hidden rounded-full" aria-hidden>
                <span className="w-1/4 bg-rose-200" /><span className="flex-1 bg-emerald-200" /><span className="w-1/4 bg-orange-200" />
                <motion.span className="absolute -top-0.5 h-2.5 w-1 rounded bg-slate-700" initial={{ left: "50%" }} animate={{ left: `${it.pos * 100}%` }} transition={{ delay: 0.3 + i * 0.1, type: "spring", bounce: 0.3 }} />
              </div>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    );
  }
  if (variant === "analysis") {
    const steps = ["Reading the text in your file", "Recognising known lab tests", "Comparing with the printed ranges", "Checking warning signs"];
    return (
      <motion.div key="analysis" {...fade}>
        <Header title="Analysing report" tag="Example" />
        <div className="relative mt-2">
          <table className="w-full text-left text-[11px]">
            <tbody>
              {SAMPLE_ROWS.map((r, i) => (
                <tr key={r.name} className="border-t border-slate-100 first:border-t-0">
                  <td className="py-1.5 font-medium text-slate-700">{r.name}</td>
                  <td className="font-mono font-semibold text-slate-800">{r.value}</td>
                  <td className="w-16">
                    <motion.span className="block h-1.5 origin-left rounded-full bg-gradient-to-r from-cyan-300 to-sky-500"
                      initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.2 + i * 0.25, duration: 0.6 }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[22%]" aria-hidden>
            <div className="bmc-scan h-full w-full bg-gradient-to-b from-transparent via-cyan-300/40 to-transparent" style={{ animationDuration: "2s" }} />
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {steps.map((t, i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.3 }}
              className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-3 w-3" aria-hidden /></span>{t}
            </motion.li>
          ))}
        </ul>
      </motion.div>
    );
  }
  if (variant === "screening") {
    const rows = [
      { name: "Iron-deficiency anaemia", score: 0.72, conf: "Moderate" },
      { name: "Vitamin B12 deficiency", score: 0.38, conf: "Low" },
    ];
    return (
      <motion.div key="screening" {...fade}>
        <Header title="Screening summary" tag="Example" />
        <ul className="mt-3 space-y-3">
          {rows.map((r, i) => (
            <li key={r.name} className="rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-slate-800">{r.name}</p>
                <span className="font-mono text-[11px] font-bold text-sky-700">{Math.round(r.score * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-sky-400 to-brand-500" initial={{ scaleX: 0 }} animate={{ scaleX: r.score }} transition={{ delay: 0.2 + i * 0.15, duration: 0.7 }} />
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500"><Gauge className="h-3 w-3" aria-hidden /> Confidence: {r.conf} · possible match, not a diagnosis</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-lg bg-slate-50 p-2 text-[10px] leading-snug text-slate-500">Why: low hemoglobin, tiredness, low MCV. Missing: ferritin.</div>
      </motion.div>
    );
  }
  if (variant === "plan") {
    const items = [
      { icon: Salad, text: "Foods that support healthy blood", tint: "bg-emerald-50 text-emerald-600" },
      { icon: Footprints, text: "Stay active every day", tint: "bg-sky-50 text-sky-600" },
      { icon: Stethoscope, text: "Questions to ask your doctor", tint: "bg-violet-50 text-violet-600" },
      { icon: CalendarCheck, text: "When to recheck your values", tint: "bg-amber-50 text-amber-600" },
    ];
    return (
      <motion.div key="plan" {...fade}>
        <Header title="Your care plan" tag="Example" />
        <ul className="mt-3 space-y-2">
          {items.map((it, i) => (
            <motion.li key={it.text} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 * i }}
              className="flex items-center gap-2.5 rounded-xl bg-white p-2 ring-1 ring-slate-100">
              <span className={cx("flex h-7 w-7 items-center justify-center rounded-lg", it.tint)}><it.icon className="h-4 w-4" aria-hidden /></span>
              <span className="text-[12px] font-medium text-slate-700">{it.text}</span>
              <span className="ml-auto h-4 w-4 rounded-full border-2 border-emerald-400 bg-emerald-400/20" aria-hidden />
            </motion.li>
          ))}
        </ul>
      </motion.div>
    );
  }
  return (
    <motion.div key={variant} {...fade}>
      <Header title="Complete Blood Count" tag={variant === "upload" ? "Uploading" : "Sample"} />
      <table className="mt-2 w-full text-left text-[11px]">
        <thead className="text-[9px] uppercase tracking-wider text-slate-400">
          <tr><th className="py-1 font-medium">Test</th><th className="font-medium">Result</th><th className="font-medium">Range</th></tr>
        </thead>
        <tbody>
          {SAMPLE_ROWS.map((r) => (
            <tr key={r.name} className="border-t border-slate-100">
              <td className="py-1.5 font-medium text-slate-700">{r.name}</td>
              <td className={cx("font-mono font-semibold", r.flag ? "text-sky-700" : "text-slate-800")}>{r.value} <span className="font-sans text-[9px] font-normal text-slate-400">{r.unit}</span>{r.flag && <span className="ml-1 rounded bg-sky-100 px-1 text-[9px]">{r.flag}</span>}</td>
              <td className="text-slate-400">{r.range}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <svg viewBox="0 0 200 44" className="mt-3 w-full" aria-hidden>
        <defs>
          <linearGradient id="bmc-spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" /><stop offset="100%" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
        </defs>
        <rect x="0" y="12" width="200" height="16" rx="4" fill="#ecfdf5" />
        <path d="M0 30 C30 26 45 34 70 24 S120 10 140 20 S180 22 200 14 L200 44 L0 44Z" fill="url(#bmc-spark)" />
        <path d="M0 30 C30 26 45 34 70 24 S120 10 140 20 S180 22 200 14" fill="none" stroke="#0ea5e9" strokeWidth="2" />
        <circle cx="200" cy="14" r="3.5" fill="#0ea5e9" />
      </svg>
    </motion.div>
  );
}

/** A large floating lab report rendered with CSS 3D perspective. Values shown are a labelled sample. */
export default function Report3D({ variant, rotateX, rotateY, className }: {
  variant: ReportVariant; rotateX?: MotionValue<number>; rotateY?: MotionValue<number>; className?: string;
}) {
  return (
    <div className={cx("bmc-perspective", className)}>
      <motion.div
        className="bmc-preserve relative"
        style={{ rotateX, rotateY }}
        initial={false}
        animate={variant === "upload" ? { y: -10, rotateZ: -4, scale: 0.94 } : { y: 0, rotateZ: variant === "complex" ? 3 : -2, scale: 1 }}
        transition={{ type: "spring", bounce: 0.2, visualDuration: 0.6 }}
      >
        <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-[22px] bg-sky-200/60 blur-[2px]" style={{ transform: "translateZ(-40px)" }} aria-hidden />
        <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-[22px] bg-white/70 ring-1 ring-sky-100" style={{ transform: "translateZ(-20px)" }} aria-hidden />
        <div className="relative min-h-[300px] overflow-hidden rounded-[22px] bg-gradient-to-br from-white via-white to-sky-50 p-4 shadow-[0_30px_60px_-20px_rgba(14,116,144,0.45)] ring-1 ring-sky-100">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-white to-transparent opacity-80" aria-hidden />
          <AnimatePresence mode="wait" initial={false}>
            <Body key={variant} variant={variant} />
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
