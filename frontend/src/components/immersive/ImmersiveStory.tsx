import { Suspense, lazy, useEffect, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import {
  Activity, ArrowDown, Bandage, CalendarCheck, ClipboardList, Compass, FileSearch, FlaskConical, Gauge,
  Languages, ListChecks, LogIn, ScanLine, ShieldCheck, Sparkles, Stethoscope, Truck, UploadCloud, UserCheck,
} from "lucide-react";
import { UrgencyBadge } from "../badges";
import { formatDate } from "../../lib/format";
import { LANGUAGES, langPack, type LangCode } from "../../lib/languages";
import { writeSimplePref } from "../../lib/simpleLabs";
import type { AnalysisSummary } from "../../lib/types";
import { cx } from "../ui";
import Boy, { type Mood } from "../story/Boy";
import { CellField, type CellSpec } from "../story/Decor";
import Report3D, { type ReportVariant } from "../story/Report3D";
import UploadPanel, { type useReportUpload } from "../story/UploadPanel";
import XRay3D from "../story/XRay3D";
import { prefersReducedMotion, shouldRender3D, useIdleReady, usePageVisible } from "../three/webgl";

const StoryCanvas = lazy(() => import("../three/StoryCanvas"));

export const SCENE = { hero: 0, confusion: 1, upload: 2, analysis: 3, understand: 4, insights: 5, care: 6, language: 7 } as const;
export const SCENES = 8;
const LABELS = ["Welcome", "Confusion", "Upload", "Analysis", "Understand", "Insights", "Care", "Language"];

/** Scroll the window so that the given scene of the story is in view. */
export function scrollToScene(el: HTMLElement | null, scene: number) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY;
  const travel = Math.max(0, el.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + travel * ((scene + 0.5) / SCENES), behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/* ------------------------------------------------------------------ backdrop + fallback */

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_70%_40%,#0e7490_0%,#0b4f57_38%,#042f35_70%,#021a1f_100%)]" />
      <div className="bmc-aurora absolute -left-1/4 top-[-30%] h-[80%] w-[70%] rounded-full bg-teal-400/25 blur-[120px]" />
      <div className="bmc-aurora absolute bottom-[-30%] right-[-10%] h-[70%] w-[60%] rounded-full bg-cyan-300/20 blur-[120px]" style={{ animationDelay: "-6s" }} />
      <div className="absolute right-[18%] top-[18%] h-64 w-64 rounded-full bg-rose-400/10 blur-[90px]" />
      <div className="absolute inset-0 opacity-[0.09] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(60%_60%_at_65%_55%,black,transparent)]" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#021a1f]/80 to-transparent" />
    </div>
  );
}

const FALLBACK_CELLS: CellSpec[] = [
  { x: "6%", y: "10%", size: 46, delay: 0, dur: 7, tilt: -20 }, { x: "86%", y: "8%", size: 54, delay: 0.6, dur: 6.5, tilt: 15 },
  { x: "92%", y: "62%", size: 34, delay: 2, dur: 7.5, tilt: -35, blur: true }, { x: "40%", y: "88%", size: 28, delay: 0.3, dur: 6, tilt: -10 },
];
const FB_VARIANT: ReportVariant[] = ["hero", "complex", "upload", "analysis", "simple", "screening", "plan", "simple"];
const FB_MOOD: Mood[] = ["hero", "confused", "uploading", "curious", "happy", "curious", "happy", "hero"];

/** Lightweight CSS/SVG version used when WebGL is unavailable. */
export function FallbackVisual({ scene }: { scene: number }) {
  return (
    <div className="absolute inset-x-0 top-[6%] mx-auto h-[42%] max-w-[520px] lg:inset-y-0 lg:left-auto lg:right-[4%] lg:my-auto lg:h-[70%] lg:w-[46%] lg:max-w-[620px]" aria-hidden>
      <CellField cells={FALLBACK_CELLS} />
      {(scene === 0 || scene === 1 || scene === 3) && <XRay3D scanning={scene === 3} className="absolute right-[4%] top-0 w-[28%]" />}
      <div className="absolute left-[4%] top-[12%] w-[56%]"><Report3D variant={FB_VARIANT[scene]} /></div>
      <div className="absolute bottom-0 right-[2%] w-[38%]"><Boy mood={FB_MOOD[scene]} className="w-full drop-shadow-[0_24px_30px_rgba(0,0,0,0.35)]" /></div>
    </div>
  );
}

function Loading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center lg:justify-end lg:pr-[22%]" aria-hidden>
      <div className="h-24 w-24 animate-pulse rounded-full bg-cyan-300/20 blur-xl" />
    </div>
  );
}

/* ------------------------------------------------------------------ UI pieces */

export function GlowButton({ children, onClick, to, variant = "primary", icon: Icon }: {
  children: ReactNode; onClick?: () => void; to?: string; variant?: "primary" | "glass"; icon?: typeof Compass;
}) {
  const cls = cx(
    "group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl px-6 py-3.5 text-sm font-semibold transition-shadow",
    variant === "primary"
      ? "bg-gradient-to-r from-teal-300 via-cyan-300 to-sky-300 text-slate-900 shadow-[0_0_0_1px_rgba(255,255,255,.35)_inset,0_12px_40px_-8px_rgba(45,212,191,.7)] hover:shadow-[0_0_0_1px_rgba(255,255,255,.5)_inset,0_16px_50px_-6px_rgba(45,212,191,.9)]"
      : "bg-white/10 text-white ring-1 ring-white/25 backdrop-blur-md hover:bg-white/15 hover:ring-white/40",
  );
  const inner = (
    <>
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/40 opacity-0 blur-md transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" aria-hidden />
      {Icon && <Icon className="relative h-5 w-5" aria-hidden />}
      <span className="relative">{children}</span>
    </>
  );
  return (
    <motion.span whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="inline-flex">
      {to ? <Link to={to} onClick={onClick} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>}
    </motion.span>
  );
}

function Glass({ icon: Icon, title, children, tone = "text-cyan-200" }: { icon: typeof Gauge; title: string; children: ReactNode; tone?: string }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-white/[0.07] p-3.5 ring-1 lg:py-[clamp(0.5rem,1.5vh,0.875rem)] ring-white/12 backdrop-blur-md">
      <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15", tone)}><Icon className="h-5 w-5" aria-hidden /></span>
      <div><p className="text-sm font-semibold text-white">{title}</p><p className="text-sm leading-snug text-teal-50/75">{children}</p></div>
    </li>
  );
}

const eyebrow = (n: number, t: string) => (
  <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
    <span className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-300" aria-hidden /> {String(n).padStart(2, "0")} · {t}
  </p>
);
const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mt-4 text-[2rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[clamp(2rem,6.2vh,3rem)]">{children}</h2>
);
const P = ({ children }: { children: ReactNode }) => <p className="mt-4 max-w-xl text-base leading-relaxed text-teal-50/80 sm:text-lg">{children}</p>;
const Note = ({ children }: { children: ReactNode }) => <p className="mt-4 max-w-xl text-xs leading-relaxed text-teal-100/60">{children}</p>;
const Grad = ({ children }: { children: ReactNode }) => (
  <span className="bg-gradient-to-r from-teal-200 via-cyan-300 to-sky-300 bg-clip-text text-transparent">{children}</span>
);

/* ------------------------------------------------------------------ scene copy */

function SceneCopy({ scene, ctx }: { scene: number; ctx: StoryProps & { lang: LangCode; setLang: (l: LangCode) => void; go: (s: number) => void } }) {
  const { latestAnalysis, labReportId, upload, firstName, lang, setLang, go, guest } = ctx;
  const dest = (to: string) => (guest ? "/register" : to);
  switch (scene) {
    case SCENE.hero:
      return (
        <>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-cyan-100 ring-1 ring-white/20 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" /><span className="relative h-2 w-2 rounded-full bg-cyan-300" /></span>
            {firstName ? `Welcome back, ${firstName}` : "Welcome to BookMyCare"}
          </p>
          <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-[clamp(2.75rem,9.5vh,4.75rem)]">
            Your Health, <Grad>Beyond the Numbers.</Grad>
          </h1>
          <P>From blood reports and X-rays to meaningful health insights, understand your health in a simpler, smarter way.</P>
          <div className="mt-8 flex flex-wrap gap-3">
            <GlowButton icon={Compass} onClick={() => go(SCENE.upload)}>Start Your Health Journey</GlowButton>
            <GlowButton variant="glass" onClick={() => go(SCENE.confusion)}>Explore the Experience</GlowButton>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-teal-50/70">
            <li className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-cyan-300" aria-hidden /> Plain-language explanations</li>
            <li className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden /> WHO / CDC sourced</li>
            <li className="inline-flex items-center gap-1.5"><Stethoscope className="h-4 w-4 text-rose-300" aria-hidden /> Not a diagnosis</li>
          </ul>
        </>
      );
    case SCENE.confusion:
      return (
        <>
          {eyebrow(1, "The confusion")}
          <H2>Medical Reports Can Feel <Grad>Complicated.</Grad></H2>
          <P>MCHC, RDW-CV, reference intervals, shadows on an X-ray - unfamiliar terms and numbers make it hard to know what's happening with your health.</P>
        </>
      );
    case SCENE.upload:
      return (
        <>
          {eyebrow(2, "Upload")}
          <H2>Bring Your Health Information <Grad>Together.</Grad></H2>
          <P>Blood reports, other medical reports and X-rays - saved securely to your BookMyCare records.</P>
          {upload ? (
            <div className="mt-6 max-w-xl rounded-3xl bg-white/95 p-4 text-slate-800 shadow-[0_30px_80px_-30px_rgba(34,211,238,.6)] ring-1 ring-white/50 backdrop-blur">
              <UploadPanel {...upload} />
            </div>
          ) : (
            <div className="mt-6 max-w-xl rounded-3xl bg-white/[0.08] p-5 ring-1 ring-white/15 backdrop-blur-md">
              <p className="flex items-center gap-2 text-sm font-semibold text-white"><UploadCloud className="h-5 w-5 text-cyan-300" aria-hidden /> Upload blood reports, medical reports and X-rays</p>
              <p className="mt-1 text-sm text-teal-50/75">{guest ? "Create a free account to keep your files private to you, then upload in seconds." : "Your uploads live in your private dashboard."}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {guest ? (
                  <>
                    <GlowButton to="/register">Get Started</GlowButton>
                    <GlowButton variant="glass" to="/login" icon={LogIn}>Login</GlowButton>
                  </>
                ) : <GlowButton to="/reports" icon={UploadCloud}>Upload in your dashboard</GlowButton>}
              </div>
            </div>
          )}
        </>
      );
    case SCENE.analysis:
      return (
        <>
          {eyebrow(3, "Analysis")}
          <H2>Transform Medical Information Into <Grad>Meaningful Insights.</Grad></H2>
          <ul className="mt-6 grid max-w-xl gap-2.5">
            <Glass icon={FileSearch} title="Reads your report">Recognises 28 common blood tests and compares each value with its reference range.</Glass>
            <Glass icon={ListChecks} title="Transparent rules" tone="text-teal-200">Combines results with your symptoms, profile and history - every factor is shown.</Glass>
            <Glass icon={ScanLine} title="Image checks" tone="text-violet-200">X-rays are quality-checked; AI observations, when available, are marked unverified.</Glass>
          </ul>
          <div className="mt-6"><GlowButton to={dest("/analyses/new")} icon={Activity}>{guest ? "Create an account to start" : "Start an analysis"}</GlowButton></div>
        </>
      );
    case SCENE.understand:
      return (
        <>
          {eyebrow(4, "Understanding")}
          <H2>Complex Numbers. <Grad>Simple Explanations.</Grad></H2>
          <ul className="mt-6 grid max-w-xl gap-2.5">
            <Glass icon={Truck} title="Hemoglobin" tone="text-rose-200">Your body's oxygen delivery team.</Glass>
            <Glass icon={ShieldCheck} title="White blood cells" tone="text-sky-200">Your body's defence team.</Glass>
            <Glass icon={Bandage} title="Platelets" tone="text-amber-200">Your body's tiny repair helpers - plus 25 more supported tests.</Glass>
          </ul>
          <div className="mt-6">
            {labReportId != null
              ? <GlowButton to={`/reports/${labReportId}`} onClick={() => writeSimplePref(true)} icon={Sparkles}>See your report in Simple Mode</GlowButton>
              : <GlowButton onClick={() => go(SCENE.upload)} icon={Sparkles}>{guest ? "See how to add your report" : "Upload a report to see yours"}</GlowButton>}
          </div>
        </>
      );
    case SCENE.insights:
      return (
        <>
          {eyebrow(5, "Health insights")}
          <H2>See What Your Health Information <Grad>May Reveal.</Grad></H2>
          <ul className="mt-6 grid max-w-xl gap-2.5">
            <Glass icon={Gauge} title="Match score">How closely your symptoms and results fit a condition's known pattern.</Glass>
            <Glass icon={Activity} title="Confidence" tone="text-violet-200">Low, moderate or high - based on how much evidence was available.</Glass>
            <Glass icon={ClipboardList} title="Factors considered" tone="text-teal-200">What supported or argued against each match, and what was missing.</Glass>
          </ul>
          {latestAnalysis ? (
            <Link to={`/analyses/${latestAnalysis.id}`} className="mt-4 flex max-w-xl flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/95 p-3.5 text-slate-900 ring-1 ring-white/60 transition hover:-translate-y-0.5">
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Your latest screening · {formatDate(latestAnalysis.created_at)}</span>
                <span className="block text-sm font-semibold">{latestAnalysis.top_condition ?? "No strong match"}</span>
              </span>
              <UrgencyBadge urgency={latestAnalysis.urgency} />
            </Link>
          ) : <div className="mt-6"><GlowButton to={dest("/analyses/new")} icon={Activity}>{guest ? "Get started free" : "Run your first screening"}</GlowButton></div>}
          <p className="mt-4 inline-flex max-w-xl items-start gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-100 ring-1 ring-rose-300/30">
            <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Screening insights are possible matches, not confirmed diagnoses. Only a doctor can diagnose a condition.
          </p>
        </>
      );
    case SCENE.care:
      return (
        <>
          {eyebrow(6, "Personalized care")}
          <H2>Understand Your <Grad>Next Steps.</Grad></H2>
          <ul className="mt-6 grid max-w-xl gap-2.5 sm:grid-cols-2">
            <Glass icon={UserCheck} title="Personal guidance">Self-care matched to your profile.</Glass>
            <Glass icon={FlaskConical} title="Follow-up tests" tone="text-sky-200">Tests worth asking about.</Glass>
            <Glass icon={Stethoscope} title="Doctor questions" tone="text-violet-200">What to ask at your visit.</Glass>
            <Glass icon={CalendarCheck} title="When to act" tone="text-amber-200">Warning signs and timing.</Glass>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            {latestAnalysis
              ? <><GlowButton to={`/analyses/${latestAnalysis.id}`}>Open your care plan</GlowButton><GlowButton variant="glass" to="/analyses/new">New analysis</GlowButton></>
              : <GlowButton to={dest("/analyses/new")}>{guest ? "Get started free" : "Create your care plan"}</GlowButton>}
          </div>
          <Note>Guidance from transparent rules and WHO/CDC sources - to discuss with a doctor, not a substitute for medical advice.</Note>
        </>
      );
    default: {
      const pack = langPack(lang);
      return (
        <>
          {eyebrow(7, "Your language")}
          <H2>Your Health. <Grad>Your Language.</Grad></H2>
          <div role="radiogroup" aria-label="Preview language" className="mt-6 flex max-w-xl flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button key={l.code} type="button" role="radio" aria-checked={l.code === lang} onClick={() => setLang(l.code)} lang={l.code}
                className={cx("rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                  l.code === lang ? "bg-gradient-to-r from-teal-300 to-cyan-300 text-slate-900 shadow-[0_8px_24px_-8px_rgba(45,212,191,.8)]" : "bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15")}>
                {l.native}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.ul key={lang} lang={lang} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
              className="mt-4 grid max-w-xl gap-2" aria-live="polite">
              {pack.items.map((it, i) => (
                <li key={i} className="rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/12 backdrop-blur-md">
                  <p className="text-sm font-semibold text-white">{it.name}</p>
                  <p className="text-sm text-teal-50/80">{it.text}</p>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
          <Note><Languages className="mr-1 inline h-3.5 w-3.5" aria-hidden />Preview: these sample explanations are translated. Your report results are currently explained in English.</Note>
        </>
      );
    }
  }
}

/* ------------------------------------------------------------------ main */

interface StoryProps {
  sectionRef: RefObject<HTMLElement | null>;
  /** Omitted on the public homepage: the upload scene then invites visitors to sign up. */
  upload?: ReturnType<typeof useReportUpload>;
  labReportId?: number | null;
  latestAnalysis?: AnalysisSummary | null;
  firstName?: string;
  /** Public homepage for visitors who are not signed in. */
  guest?: boolean;
  /** "public" when a fixed top navbar overlays the story (full-height sticky stage). */
  frame?: "app" | "public";
}

export default function ImmersiveStory(props: StoryProps) {
  const { sectionRef } = props;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const [scene, setScene] = useState(0);
  const [lang, setLang] = useState<LangCode>("hi");
  const [active, setActive] = useState(true);
  const [webgl] = useState(shouldRender3D);
  const idle = useIdleReady();
  const pageVisible = usePageVisible();
  const [calm] = useState(prefersReducedMotion);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const s = Math.min(SCENES - 1, Math.max(0, Math.floor(v * SCENES)));
    setScene((p) => (p === s ? p : s));
  });

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    return () => io.disconnect();
  }, [sectionRef]);

  const go = (s: number) => scrollToScene(sectionRef.current, s);

  return (
    <section ref={sectionRef} id="experience" aria-label="The BookMyCare experience" className="relative" style={{ height: `${SCENES * 100}svh` }}>
      <div className={cx("sticky overflow-hidden bg-[#021a1f] text-white", props.frame === "public" ? "top-0 h-svh" : "top-14 h-[calc(100svh-3.5rem)] lg:top-0 lg:h-svh")}>
        <Backdrop />
        <div className="absolute inset-0">
          {webgl ? (
            idle ? (
              <Suspense fallback={<Loading />}>
                <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
                  <StoryCanvas scene={scene} lang={lang} active={active && pageVisible} calm={calm} />
                </motion.div>
              </Suspense>
            ) : <Loading />
          ) : <FallbackVisual scene={scene} />}
        </div>

        {/* copy */}
        <div className="pointer-events-none absolute inset-0 flex items-end lg:items-center">
          <div className={cx("pointer-events-auto max-h-[58%] w-full overflow-y-auto bg-gradient-to-t from-[#021a1f] via-[#021a1f]/90 to-transparent px-5 pb-6 pt-10 sm:px-10 lg:max-h-full lg:max-w-[min(46%,620px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:bg-none lg:py-8 lg:pl-14 xl:pl-20", props.frame === "public" && "lg:pt-20")}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={scene}
                initial={{ opacity: 0, y: 30, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -24, filter: "blur(6px)" }}
                transition={{ type: "spring", bounce: 0.12, visualDuration: 0.5 }}>
                <SceneCopy scene={scene} ctx={{ ...props, lang, setLang, go }} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* progress rail */}
        <nav aria-label="Story steps" className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 sm:block lg:right-6">
          <ol className="flex flex-col items-end gap-3">
            {LABELS.map((l, i) => (
              <li key={l}>
                <button type="button" onClick={() => go(i)} aria-label={`${i + 1}. ${l}`} aria-current={i === scene ? "step" : undefined}
                  className="group flex items-center gap-3">
                  <span className={cx("text-[11px] font-semibold uppercase tracking-wider transition", i === scene ? "text-cyan-200 opacity-100" : "text-white/50 opacity-0 group-hover:opacity-100")}>{l}</span>
                  <span className={cx("block rounded-full transition-all", i === scene ? "h-7 w-1.5 bg-gradient-to-b from-teal-300 to-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.8)]" : "h-1.5 w-1.5 bg-white/40 group-hover:bg-white/80")} />
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="absolute inset-x-0 top-0 h-0.5 bg-white/10 sm:hidden" aria-hidden>
          <motion.div className="h-full origin-left bg-gradient-to-r from-teal-300 to-cyan-300" style={{ scaleX: scrollYProgress }} />
        </div>

        <AnimatePresence>
          {scene === 0 && (
            <motion.button type="button" onClick={() => go(SCENE.confusion)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60 hover:text-white lg:flex">
              Scroll to explore
              <span className="flex h-9 w-6 justify-center rounded-full ring-1 ring-white/40"><ArrowDown className="mt-2 h-3.5 w-3.5 animate-bounce" aria-hidden /></span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

