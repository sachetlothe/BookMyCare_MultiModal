import { useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  ArrowDown, ArrowRight, ArrowUp, BookOpen, Check, Eye, HeartPulse, ListChecks, ShieldCheck, Sparkles, Stethoscope, type LucideIcon,
} from "lucide-react";
import { buildMeter, simpleInfo, zoneOf, ZONE_STYLE, type Zone } from "../../lib/simpleLabs";
import type { LabValue } from "../../lib/types";
import { BloodCell } from "../story/Decor";
import Companion from "../story/Companion";
import Report3D from "../story/Report3D";
import { cx } from "../ui";
import { CAPS, SAMPLE } from "./HomeSections";

/* ------------------------------------------------------------------ shared design language */

const ease = [0.22, 1, 0.36, 1] as const;
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, margin: "-90px" } } as const;
const rise: Variants = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } } };
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };

function Eyebrow({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] ring-1",
      dark ? "bg-white/10 text-cyan-200 ring-white/15" : "bg-teal-50 text-teal-700 ring-teal-100")}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dark ? "bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,.9)]" : "bg-teal-500")} aria-hidden />
      {children}
    </p>
  );
}

function Heading({ id, children, dark }: { id?: string; children: ReactNode; dark?: boolean }) {
  return (
    <h2 id={id} className={cx("mt-4 text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]", dark ? "text-white" : "text-slate-900")}>
      {children}
    </h2>
  );
}

const Accent = ({ children, dark }: { children: ReactNode; dark?: boolean }) => (
  <span className={cx("bg-clip-text text-transparent", dark ? "bg-gradient-to-r from-teal-200 via-cyan-300 to-sky-300" : "bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500")}>{children}</span>
);

/** Icon tile used in all three sections, so every icon has the same size, radius and colour. */
function IconTile({ icon: Icon, size = "md" }: { icon: LucideIcon; size?: "md" | "lg" }) {
  return (
    <span className={cx("relative flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-[0_10px_24px_-10px_rgba(13,148,136,.9)]",
      size === "lg" ? "h-14 w-14" : "h-12 w-12")}>
      <span className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/35 to-transparent" aria-hidden />
      <Icon className={cx("relative", size === "lg" ? "h-6 w-6" : "h-[22px] w-[22px]")} aria-hidden />
    </span>
  );
}

/* ------------------------------------------------------------------ 1. features */

function FeatureCard({ cap, index }: { cap: (typeof CAPS)[number]; index: number }) {
  function spot(e: MouseEvent<HTMLAnchorElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  }
  return (
    <motion.li variants={rise} className="h-full">
      <Link to={cap.to} onMouseMove={spot}
        className="group relative flex h-full flex-col overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,.04),0_24px_48px_-32px_rgba(13,148,136,.45)] ring-1 ring-slate-200/70 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_1px_0_rgba(15,23,42,.04),0_34px_60px_-30px_rgba(13,148,136,.55)] hover:ring-teal-300/70 focus-visible:-translate-y-1.5 sm:p-7">
        <span className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100 [background:radial-gradient(260px_circle_at_var(--mx,50%)_var(--my,0%),rgba(45,212,191,.13),transparent_70%)]" aria-hidden />
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/70 to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden />
        <div className="relative flex items-start justify-between">
          <IconTile icon={cap.icon} />
          <span className="font-mono text-xs font-semibold text-slate-300 transition group-hover:text-teal-400">{String(index + 1).padStart(2, "0")}</span>
        </div>
        <h3 className="relative mt-5 text-lg font-bold text-slate-900">{cap.title}</h3>
        <p className="relative mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{cap.text}</p>
        <span className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700">
          Explore <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
        </span>
      </Link>
    </motion.li>
  );
}

export function FeaturesSection() {
  return (
    <section aria-labelledby="caps" className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50/70 to-slate-50 py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-200 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-teal-100/60 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-100/50 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(13,148,136,.18)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <motion.div {...inView} variants={stagger} className="mx-auto max-w-3xl text-center">
          <motion.div variants={rise}><Eyebrow>What BookMyCare does</Eyebrow></motion.div>
          <motion.div variants={rise}><Heading id="caps">Everything your health information needs - <Accent>in one place.</Accent></Heading></motion.div>
          <motion.p variants={rise} className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
            Each capability below is a working part of the app, built on transparent rules and trusted sources.
          </motion.p>
        </motion.div>

        <motion.ul {...inView} variants={stagger} className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {CAPS.map((c, i) => <FeatureCard key={c.title} cap={c} index={i} />)}
        </motion.ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 2. simple mode */

const unit = (u: string | null) => (u ?? "").replace("x10^3", "×10³").replace("x10^6", "×10⁶");

const ZONE_ICON: Record<Zone, LucideIcon> = { low: ArrowDown, normal: Check, high: ArrowUp };
const ZONE_BAR: Record<Zone, string> = {
  low: "bg-gradient-to-r from-rose-300 to-rose-200",
  normal: "bg-gradient-to-r from-emerald-200 via-emerald-300 to-emerald-200",
  high: "bg-gradient-to-r from-orange-200 to-orange-300",
};

function BiomarkerCard({ lab, i }: { lab: LabValue; i: number }) {
  const info = simpleInfo(lab.key);
  const zone = zoneOf(lab.status);
  const meter = buildMeter(lab.value, lab.ref_low, lab.ref_high);
  const Z = ZONE_ICON[zone];
  const note = zone === "low" ? info.low : zone === "high" ? info.high : undefined;
  return (
    <motion.li variants={rise} className="rounded-2xl bg-white p-4 shadow-[0_12px_30px_-22px_rgba(15,23,42,.45)] ring-1 ring-slate-200/70 transition hover:ring-teal-200 sm:p-5">
      <div className="flex items-start gap-3">
        <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br", info.tint)}><info.icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-semibold text-slate-900">{lab.test}</p>
            <p className="font-mono text-lg font-bold text-slate-900">{lab.value}<span className="ml-1 font-sans text-xs font-medium text-slate-400">{unit(lab.unit)}</span></p>
          </div>
          <p className="text-xs font-medium text-teal-700">{info.nickname}</p>
        </div>
      </div>

      {meter && (
        <div className="mt-4">
          <div className="relative h-2.5">
            <div className="flex h-full gap-0.5 overflow-hidden rounded-full">
              {meter.segments.map((s) => <span key={s.zone} className={ZONE_BAR[s.zone]} style={{ width: `${(s.to - s.from) * 100}%` }} />)}
            </div>
            <motion.span
              className="absolute -top-1.5 h-[22px] w-[22px] -translate-x-1/2 rounded-full border-[3px] border-white bg-slate-900 shadow-md"
              initial={{ left: "50%" }} whileInView={{ left: `${meter.position * 100}%` }} viewport={{ once: true }}
              transition={{ type: "spring", bounce: 0.35, visualDuration: 0.8, delay: 0.3 + i * 0.12 }}
              aria-hidden
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
            <span>Low</span><span className="text-slate-500">Typical: {lab.ref_low} – {lab.ref_high}</span><span>High</span>
          </div>
        </div>
      )}

      <p className={cx("mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", ZONE_STYLE[zone].chip)}>
        <Z className="h-3.5 w-3.5" aria-hidden /> {ZONE_STYLE[zone].label}
      </p>
      <p className="mt-2.5 text-sm leading-relaxed text-slate-600">{note ?? info.what}</p>
    </motion.li>
  );
}

function DetailedTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-slate-400">
            <th className="pb-3 font-semibold">Test</th><th className="pb-3 font-semibold">Result</th><th className="pb-3 font-semibold">Reference range</th><th className="pb-3 font-semibold">Flag</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {SAMPLE.map((l) => {
            const z = zoneOf(l.status);
            return (
              <tr key={l.key}>
                <td className="py-3.5 font-medium text-slate-800">{l.test}</td>
                <td className="py-3.5 font-mono font-semibold text-slate-900">{l.value} <span className="font-sans text-xs font-normal text-slate-400">{unit(l.unit)}</span></td>
                <td className="py-3.5 text-slate-500">{l.ref_low} – {l.ref_high}</td>
                <td className="py-3.5"><span className={cx("rounded-md px-2 py-0.5 font-mono text-xs font-bold ring-1", ZONE_STYLE[z].chip)}>{z === "low" ? "L" : z === "high" ? "H" : "N"}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">The detailed view keeps the original numbers, units and reference ranges exactly as reported.</p>
    </div>
  );
}

export function SimpleModeSection() {
  const [simple, setSimple] = useState(true);
  const modes = [{ key: true, label: "Simple explanation", icon: Sparkles }, { key: false, label: "Detailed medical", icon: ListChecks }] as const;
  return (
    <section aria-labelledby="simple-showcase" className="relative isolate overflow-hidden bg-[radial-gradient(120%_120%_at_0%_0%,#0d9488_0%,#0b5f66_35%,#063c43_70%,#04262b_100%)] py-20 text-white sm:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-50/10 to-transparent" aria-hidden />
      <div className="bmc-aurora pointer-events-none absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-cyan-300/20 blur-[110px]" aria-hidden />
      <div className="bmc-aurora pointer-events-none absolute -bottom-32 right-[-6rem] h-[30rem] w-[30rem] rounded-full bg-teal-300/20 blur-[120px]" style={{ animationDelay: "-8s" }} aria-hidden />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(70%_60%_at_70%_50%,black,transparent)]" aria-hidden />
      {[
        { c: "left-[6%] top-[14%]", s: 34, d: "0s", b: true },
        { c: "left-[42%] bottom-[8%]", s: 26, d: "1.6s", b: true },
        { c: "right-[4%] top-[8%]", s: 44, d: "0.8s", b: false },
      ].map((p, i) => (
        <div key={i} className={cx("bmc-float pointer-events-none absolute", p.c)} style={{ animationDelay: p.d, ["--tilt" as string]: `${i * 25 - 20}deg` }} aria-hidden>
          <BloodCell size={p.s} className={cx("drop-shadow-[0_10px_18px_rgba(0,0,0,.35)]", p.b ? "opacity-60 blur-[1.5px]" : "opacity-90")} />
        </div>
      ))}

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-14 lg:px-8">
        <motion.div {...inView} variants={stagger}>
          <motion.div variants={rise}><Eyebrow dark>Simple Mode</Eyebrow></motion.div>
          <motion.div variants={rise}><Heading id="simple-showcase" dark>One switch from medical to <Accent dark>meaningful.</Accent></Heading></motion.div>
          <motion.p variants={rise} className="mt-4 text-base leading-relaxed text-teal-50/80 sm:text-lg">
            Turn on Simple Mode on any report or analysis to see everyday explanations, colour meters drawn from the lab's own reference ranges, and clear arrows - while the original numbers stay available.
          </motion.p>

          <motion.div variants={rise} role="radiogroup" aria-label="Showcase view" className="mt-8 inline-flex rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/15 backdrop-blur">
            {modes.map((m) => (
              <button key={m.label} type="button" role="radio" aria-checked={simple === m.key} onClick={() => setSimple(m.key)}
                className={cx("relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors", simple === m.key ? "text-slate-900" : "text-white/80 hover:text-white")}>
                {simple === m.key && <motion.span layoutId="sm-toggle" className="absolute inset-0 rounded-xl bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,.5)]" transition={{ type: "spring", bounce: 0.2, visualDuration: 0.35 }} />}
                <m.icon className="relative h-4 w-4" aria-hidden /><span className="relative">{m.label}</span>
              </button>
            ))}
          </motion.div>

          <motion.ul variants={rise} className="mt-8 space-y-3 text-sm text-teal-50/85">
            {[
              [Eye, "Colour meters use the range printed with each value"],
              [ArrowUp, "Arrows and words - never colour alone"],
              [ListChecks, "Original values always one tap away"],
            ].map(([I, t]) => {
              const Ico = I as LucideIcon;
              return (
                <li key={t as string} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15"><Ico className="h-4 w-4 text-cyan-200" aria-hidden /></span>{t as string}
                </li>
              );
            })}
          </motion.ul>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 40, rotateX: 8 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: true, margin: "-90px" }} transition={{ duration: 0.9, ease }}
          className="relative [perspective:1400px]">
          <div className="pointer-events-none absolute -inset-6 rounded-[40px] bg-cyan-300/20 blur-3xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[28px] bg-slate-50/95 shadow-[0_50px_100px_-40px_rgba(0,0,0,.7)] ring-1 ring-white/50 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex gap-1.5" aria-hidden><span className="h-2.5 w-2.5 rounded-full bg-rose-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>
                <p className="text-sm font-semibold text-slate-800">Complete Blood Count</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200">Sample values · for illustration</span>
            </div>
            <div className="p-4 sm:p-6">
              <AnimatePresence mode="wait" initial={false}>
                {simple ? (
                  <motion.ul key="simple" initial="hidden" animate="show" exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }} variants={stagger} className="space-y-3">
                    {SAMPLE.map((l, i) => <BiomarkerCard key={l.key} lab={l} i={i} />)}
                    <motion.li variants={rise} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-[11px] font-medium text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-rose-300" /> Low</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-emerald-300" /> Typical</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-orange-300" /> High</span>
                      <span className="ml-auto">Not a diagnosis</span>
                    </motion.li>
                  </motion.ul>
                ) : (
                  <motion.div key="detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}>
                    <DetailedTable />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 3. about */

const ABOUT: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ShieldCheck, title: "Safety First", text: "Rules decide urgency and warning signs; AI only helps explain. Nothing here is a diagnosis." },
  { icon: BookOpen, title: "Trusted Sources", text: "Explanations cite WHO and CDC passages, so you can check where advice comes from." },
  { icon: Stethoscope, title: "Made for Doctor Visits", text: "Simple explanations, follow-up tests and questions help you have a better conversation with your doctor." },
];

function AboutIllustration() {
  return (
    <div className="relative mx-auto mt-10 h-[280px] w-full max-w-[460px] sm:h-[320px]" aria-hidden>
      <div className="absolute inset-x-8 bottom-2 h-10 rounded-[50%] bg-teal-900/10 blur-xl" />
      <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-teal-200/60 to-cyan-100/30 blur-2xl" />
      <div className="bmc-float absolute left-[2%] top-[4%]" style={{ animationDuration: "8s", ["--tilt" as string]: "-20deg" }}><BloodCell size={40} className="drop-shadow-[0_10px_14px_rgba(190,18,60,.25)]" /></div>
      <div className="bmc-float absolute right-[4%] top-[58%]" style={{ animationDelay: "1.2s", ["--tilt" as string]: "30deg" }}><BloodCell size={30} className="opacity-80 drop-shadow-[0_10px_14px_rgba(190,18,60,.25)]" /></div>
      <div className="bmc-float absolute left-[46%] top-0" style={{ animationDelay: "2s", ["--tilt" as string]: "10deg" }}><BloodCell size={22} className="opacity-60 blur-[1px]" /></div>

      <div className="bmc-bob absolute left-[6%] top-[12%] w-[58%] origin-top-left scale-[0.92]">
        <Report3D variant="simple" />
      </div>
      <div className="bmc-bob absolute bottom-[4%] right-[10%] w-[34%]" style={{ animationDelay: "1s" }}>
        <Companion className="w-full drop-shadow-[0_18px_22px_rgba(15,118,110,.3)]" />
      </div>
      <div className="bmc-float absolute right-[2%] top-[6%] w-[24%] rounded-xl bg-white p-2.5 shadow-[0_16px_30px_-16px_rgba(15,23,42,.4)] ring-1 ring-slate-200" style={{ animationDuration: "9s", ["--tilt" as string]: "6deg" }}>
        <div className="h-2 w-2/3 rounded bg-teal-400" />
        {[90, 75, 85, 60].map((w) => <div key={w} className="mt-1.5 h-1.5 rounded bg-slate-200" style={{ width: `${w}%` }} />)}
      </div>
      <p className="absolute bottom-0 left-0 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">Illustration</p>
    </div>
  );
}

export function AboutSection() {
  return (
    <section aria-labelledby="about" className="relative overflow-hidden bg-gradient-to-b from-[#e3f6f2] via-emerald-50/60 to-white py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#04262b]/10 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-cyan-100/70 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-teal-100/70 blur-3xl" aria-hidden />

      <div className="relative mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8">
        <motion.div {...inView} variants={stagger}>
          <motion.div variants={rise}><Eyebrow>About BookMyCare</Eyebrow></motion.div>
          <motion.div variants={rise}><Heading id="about">Medical information, <Accent>made human.</Accent></Heading></motion.div>
          <motion.p variants={rise} className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
            BookMyCare is an educational health companion. It helps you read your blood reports, medical reports and X-rays in plain language - and prepares you for the conversation that matters most: the one with your doctor.
          </motion.p>
          <motion.div variants={rise}><AboutIllustration /></motion.div>
        </motion.div>

        <motion.ul {...inView} variants={stagger} className="grid gap-4 sm:gap-5">
          {ABOUT.map((p, i) => (
            <motion.li key={p.title} variants={rise}
              className="group relative flex gap-5 overflow-hidden rounded-[28px] bg-white/85 p-6 shadow-[0_24px_48px_-32px_rgba(13,148,136,.5)] ring-1 ring-teal-100 backdrop-blur transition duration-300 hover:-translate-y-1 hover:bg-white hover:ring-teal-300/70 sm:p-7">
              <span className="absolute inset-y-6 left-0 w-1 rounded-r-full bg-gradient-to-b from-teal-400 to-cyan-400 opacity-0 transition group-hover:opacity-100" aria-hidden />
              <IconTile icon={p.icon} size="lg" />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-900">{p.title}</h3>
                  <span className="font-mono text-xs font-semibold text-teal-300">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{p.text}</p>
              </div>
            </motion.li>
          ))}
          <motion.li variants={rise} className="flex items-center gap-3 px-2 pt-1 text-sm text-slate-500">
            <HeartPulse className="h-4 w-4 text-teal-600" aria-hidden /> An educational prototype - always confirm with a qualified doctor.
          </motion.li>
        </motion.ul>
      </div>
    </section>
  );
}
