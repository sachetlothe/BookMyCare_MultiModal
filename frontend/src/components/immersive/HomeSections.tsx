import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  BookOpen, Droplet, FileText, HeartHandshake, HeartPulse, Languages, ScanLine, ShieldCheck, Sparkles, Stethoscope, type LucideIcon,
} from "lucide-react";
import LabTable from "../LabTable";
import SimpleLabView from "../SimpleLabView";
import type { LabValue } from "../../lib/types";
import { cx } from "../ui";

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { type: "spring" as const, bounce: 0.15, visualDuration: 0.6 },
};

export function SectionHead({ eyebrow, title, children, id }: { eyebrow: string; title: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <motion.div {...reveal} className="max-w-2xl">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-600">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-base leading-relaxed text-slate-600">{children}</p>}
    </motion.div>
  );
}

export const CAPS: { icon: LucideIcon; title: string; text: string; tint: string; to: string }[] = [
  { icon: Droplet, title: "Blood reports", text: "28 common blood tests read from PDFs, images and text, each compared with its reference range.", tint: "from-rose-500 to-red-500", to: "/reports" },
  { icon: FileText, title: "Medical reports", text: "Prescriptions, discharge summaries and other reports kept together with your history.", tint: "from-sky-500 to-cyan-500", to: "/reports" },
  { icon: ScanLine, title: "X-rays & images", text: "Image quality checks, plus clearly-labelled unverified AI observations when a provider is configured.", tint: "from-violet-500 to-indigo-500", to: "/reports" },
  { icon: Stethoscope, title: "Explainable screening", text: "Possible matches with match scores, confidence and every factor that was considered.", tint: "from-teal-500 to-emerald-500", to: "/analyses/new" },
  { icon: HeartHandshake, title: "Personal care plan", text: "Self-care, follow-up tests, doctor questions and warning signs for your situation.", tint: "from-amber-500 to-orange-500", to: "/analyses" },
  { icon: BookOpen, title: "Trusted library", text: "Explanations grounded in WHO and CDC sources you can read yourself.", tint: "from-emerald-500 to-teal-600", to: "/library" },
];

export function Capabilities() {
  return (
    <section aria-labelledby="caps" className="relative">
      <SectionHead id="caps" eyebrow="What BookMyCare does" title={<>Everything your health information needs - <span className="bg-gradient-to-r from-teal-600 to-sky-500 bg-clip-text text-transparent">in one place.</span></>}>
        Each capability below is a working part of the app, built on transparent rules and trusted sources.
      </SectionHead>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPS.map((c, i) => (
          <motion.div key={c.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.05 }}>
            <Link to={c.to} className="group relative block h-full overflow-hidden rounded-3xl bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,118,110,.45)] ring-1 ring-slate-200/80 transition hover:-translate-y-1 hover:ring-teal-300">
              <div className={cx("pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-2xl transition group-hover:opacity-25", c.tint)} aria-hidden />
              <span className={cx("flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg", c.tint)}><c.icon className="h-6 w-6" aria-hidden /></span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{c.text}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

export const SAMPLE: LabValue[] = [
  { test: "Hemoglobin", key: "hemoglobin", value: 11.2, unit: "g/dL", ref_low: 12, ref_high: 15.5, status: "low" },
  { test: "White blood cells", key: "wbc", value: 7.8, unit: "x10^3/µL", ref_low: 4, ref_high: 11, status: "normal" },
  { test: "Platelets", key: "platelets", value: 245, unit: "x10^3/µL", ref_low: 150, ref_high: 450, status: "normal" },
];

export function SimpleShowcase({ labReportId }: { labReportId: number | null }) {
  const [simple, setSimple] = useState(true);
  return (
    <section aria-labelledby="simple-showcase" className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-[#04363b] via-[#075e63] to-[#0b7285] p-6 text-white shadow-[0_40px_100px_-40px_rgba(8,145,178,.7)] sm:p-10">
      <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" aria-hidden />
      <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <motion.div {...reveal} className="lg:sticky lg:top-10">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">Simple Mode</p>
          <h2 id="simple-showcase" className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">One switch from medical to <span className="bg-gradient-to-r from-teal-200 to-cyan-300 bg-clip-text text-transparent">meaningful.</span></h2>
          <p className="mt-3 text-base leading-relaxed text-teal-50/80">Turn on Simple Mode on any report or analysis to see everyday explanations, colour meters drawn from the lab's own reference ranges, and clear arrows - while the original numbers stay available.</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label="Showcase view" className="inline-flex rounded-2xl bg-white/10 p-1 ring-1 ring-white/20">
              {[["Simple explanation", true], ["Detailed medical", false]].map(([l, v]) => (
                <button key={String(l)} type="button" role="radio" aria-checked={simple === v} onClick={() => setSimple(v as boolean)}
                  className={cx("rounded-xl px-4 py-2 text-sm font-semibold transition", simple === v ? "bg-white text-slate-900 shadow" : "text-white/80 hover:text-white")}>
                  {l as string}
                </button>
              ))}
            </div>
            {labReportId != null && (
              <Link to={`/reports/${labReportId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-200 hover:text-white">
                <Sparkles className="h-4 w-4" aria-hidden /> Try it on your report
              </Link>
            )}
          </div>
        </motion.div>
        <motion.div {...reveal} className="rounded-3xl bg-white p-4 text-slate-800 shadow-2xl ring-1 ring-white/40 sm:p-5">
          <p className="mb-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sample values · for illustration</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={simple ? "s" : "d"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              {simple ? <SimpleLabView labs={SAMPLE} /> : <LabTable labs={SAMPLE} />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
}

export function SiteFooter({ emergency, guest }: { emergency?: string | null; guest?: boolean }) {
  const cols: [string, [string, string][]][] = guest
    ? [
      ["Explore", [["Home", "/"], ["Login", "/login"], ["Create account", "/register"]]],
      ["Inside BookMyCare", [["Dashboard", "/dashboard"], ["Reports & images", "/reports"], ["New analysis", "/analyses/new"], ["Health library", "/library"]]],
    ]
    : [
      ["Your health", [["Home", "/"], ["Dashboard", "/dashboard"], ["Reports & images", "/reports"], ["Medical history", "/history"], ["My profile", "/profile"]]],
      ["Insights", [["New analysis", "/analyses/new"], ["Analysis history", "/analyses"], ["Health library", "/library"]]],
    ];
  return (
    <footer className="relative mt-4 overflow-hidden bg-[#021a1f] text-teal-50/80">
      <div className="pointer-events-none absolute -top-32 left-1/3 h-64 w-96 rounded-full bg-teal-500/20 blur-3xl" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-2.5 text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg shadow-teal-500/30"><HeartPulse className="h-5 w-5" aria-hidden /></span>
            <span className="text-lg font-semibold">BookMy<span className="text-cyan-300">Care</span></span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed">Helping you understand blood reports, medical reports and images - with simple explanations grounded in WHO and CDC guidance.</p>
          <ul className="mt-4 flex flex-wrap gap-2 text-xs">
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Not a diagnosis</li>
            <li className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10"><Languages className="h-3.5 w-3.5 text-cyan-300" aria-hidden /> English (language preview)</li>
          </ul>
        </div>
        {cols.map(([h, links]) => (
          <nav key={h} aria-label={h}>
            <p className="text-sm font-semibold text-white">{h}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {links.map(([l, to]) => <li key={to}><Link to={to} className="transition hover:text-cyan-200">{l}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="relative border-t border-white/10 px-6 py-5 text-center text-xs text-teal-100/60">
        BookMyCare is an educational prototype. It does not provide medical diagnoses. In an emergency call {emergency ?? "your local emergency number"}.
      </div>
    </footer>
  );
}
