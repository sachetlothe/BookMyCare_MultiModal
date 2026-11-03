import { useRef } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { motion } from "motion/react";
import {
  Activity, AlertTriangle, ArrowRight, BellRing, CheckCircle2, ClipboardList, Droplet, FileImage, FileText, FolderOpen, HeartHandshake,
  History as HistoryIcon, Lightbulb, ScanLine, Stethoscope, UserCircle, type LucideIcon,
} from "lucide-react";
import { UrgencyBadge, MockBadge } from "../components/badges";
import ImmersiveStory, { SCENE, scrollToScene } from "../components/immersive/ImmersiveStory";
import { Capabilities, SimpleShowcase, SiteFooter } from "../components/immersive/HomeSections";
import { useReportUpload, type UploadTargetKey } from "../components/story/UploadPanel";
import { Alert, Card, EmptyState, ProgressBar, Spinner, cx } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import type { Profile, SystemStatus } from "../lib/types";
import { useAsync } from "../lib/useAsync";

export function profileCompleteness(p: Profile | null): number {
  if (!p) return 0;
  const checks = [p.date_of_birth, p.sex, p.height_cm, p.weight_kg, p.activity_level, p.alcohol_use, p.blood_group];
  return checks.filter((x) => x !== null && x !== undefined && x !== "").length / checks.length;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const status = useOutletContext<SystemStatus | null | undefined>();
  const storyRef = useRef<HTMLElement>(null);
  const { data, setData, loading, error } = useAsync(async () => {
    const [profile, reports, analyses, history] = await Promise.all([api.getProfile(), api.listReports(), api.listAnalyses(), api.listHistory()]);
    return { profile, reports, analyses, history };
  });
  const upload = useReportUpload((r) => {
    if (data) setData({ ...data, reports: [{ ...r, lab_count: r.lab_values.length }, ...data.reports] });
  });

  const firstName = user?.full_name.split(" ")[0];
  const labReport = data?.reports.find((r) => r.kind === "report" && r.lab_count > 0) ?? null;
  const latestAnalysis = data?.analyses[0] ?? null;

  return (
    <div>
      <ImmersiveStory sectionRef={storyRef} upload={upload} labReportId={labReport?.id ?? null} latestAnalysis={latestAnalysis} firstName={firstName} />

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <QuickStart
          data={data}
          onUpload={(k) => { upload.setTarget(k); scrollToScene(storyRef.current, SCENE.upload); }}
          latestAnalysisId={latestAnalysis?.id ?? null}
        />

        <Capabilities />

        <SimpleShowcase labReportId={labReport?.id ?? null} />

        <motion.section
          aria-labelledby="health-space"
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", bounce: 0.15, visualDuration: 0.5 }}
          className="space-y-6"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-600">Your health space</p>
            <h2 id="health-space" className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Your records at a glance</h2>
          </div>

          {loading ? <Spinner /> : error || !data ? <Alert kind="error">{error}</Alert> : (
            <HealthSpace data={data} />
          )}
        </motion.section>
      </div>

      <SiteFooter emergency={status?.emergency_number} />
    </div>
  );
}

type Action = { label: string; hint: string; icon: LucideIcon; tint: string } & ({ to: string } | { onClick: () => void });

function QuickStart({ data, onUpload, latestAnalysisId }: { data: DashData | null; onUpload: (k: UploadTargetKey) => void; latestAnalysisId: number | null }) {
  const analysis = latestAnalysisId != null ? `/analyses/${latestAnalysisId}` : "/analyses/new";
  const actions: Action[] = [
    { label: "Upload blood report", hint: "Lab values in Simple Mode", icon: Droplet, tint: "from-rose-100 text-rose-600", onClick: () => onUpload("blood") },
    { label: "Upload medical report", hint: "PDF, image or text", icon: FileText, tint: "from-sky-100 text-sky-600", onClick: () => onUpload("medical") },
    { label: "Upload X-ray", hint: "Quality-checked image", icon: ScanLine, tint: "from-violet-100 text-violet-600", onClick: () => onUpload("xray") },
    { label: "Previous reports", hint: "All files & images", icon: FolderOpen, tint: "from-amber-100 text-amber-600", to: "/reports" },
    { label: "Health insights", hint: latestAnalysisId != null ? "Latest screening" : "Run a screening", icon: Lightbulb, tint: "from-teal-100 text-teal-600", to: analysis },
    { label: "Recommendations", hint: "Tests & doctor questions", icon: ClipboardList, tint: "from-emerald-100 text-emerald-600", to: analysis },
    { label: "Care plan", hint: "Your next steps", icon: HeartHandshake, tint: "from-pink-100 text-pink-600", to: analysis },
  ];
  const cls = "group flex h-full flex-col items-start gap-2.5 rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-teal-300";
  const inner = (a: Action) => (
    <>
      <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br to-white", a.tint)}><a.icon className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-snug text-slate-900">{a.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-slate-500">{a.hint}</span>
      </span>
    </>
  );
  return (
    <section aria-labelledby="quick-start" className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[28px] bg-gradient-to-br from-white to-sky-50/60 p-5 shadow-sm ring-1 ring-sky-100 sm:p-6">
        <h2 id="quick-start" className="text-xl font-bold text-slate-900">Welcome back! Let's understand your health journey.</h2>
        <p className="mt-1 text-sm text-slate-500">Pick up where you left off, or add something new.</p>
        <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {actions.map((a) => (
            <li key={a.label}>
              {"to" in a ? <Link to={a.to} className={cls}>{inner(a)}</Link> : <button type="button" onClick={a.onClick} className={cx(cls, "w-full")}>{inner(a)}</button>}
            </li>
          ))}
        </ul>
      </div>
      <Notifications data={data} />
    </section>
  );
}

function Notifications({ data }: { data: DashData | null }) {
  const items: { icon: LucideIcon; tone: string; text: string; to: string }[] = [];
  if (data) {
    const a = data.analyses[0];
    if (a && (a.urgency === "emergency" || a.urgency === "urgent")) {
      items.push({ icon: AlertTriangle, tone: "bg-red-50 text-red-700", text: a.urgency === "emergency" ? "Your latest screening flagged warning signs. Seek medical care now." : "Your latest screening suggests seeing a doctor within 24 hours.", to: `/analyses/${a.id}` });
    }
    const unread = data.reports.filter((r) => r.kind === "report" && (r.extraction_status === "failed" || r.extraction_status === "partial")).length;
    if (unread) items.push({ icon: FileText, tone: "bg-amber-50 text-amber-800", text: `${unread} report${unread > 1 ? "s" : ""} could not be read fully. Try re-processing.`, to: "/reports" });
    const pc = profileCompleteness(data.profile);
    if (pc < 1) items.push({ icon: UserCircle, tone: "bg-sky-50 text-sky-800", text: `Your profile is ${Math.round(pc * 100)}% complete. Add details for more accurate ranges.`, to: "/profile" });
  }
  return (
    <aside aria-labelledby="notifications" className="self-start rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
      <h2 id="notifications" className="flex items-center gap-2 text-base font-bold text-slate-900"><BellRing className="h-4 w-4 text-teal-600" aria-hidden /> Notifications</h2>
      {!data ? <div className="mt-4"><Spinner /></div> : items.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden /> You're all caught up.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((n) => (
            <li key={n.text}>
              <Link to={n.to} className={cx("flex items-start gap-2 rounded-xl p-3 text-sm transition hover:brightness-95", n.tone)}>
                <n.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{n.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

type DashData = {
  profile: Profile;
  reports: Awaited<ReturnType<typeof api.listReports>>;
  analyses: Awaited<ReturnType<typeof api.listAnalyses>>;
  history: Awaited<ReturnType<typeof api.listHistory>>;
};

function HealthSpace({ data }: { data: DashData }) {
  const completeness = profileCompleteness(data.profile);
  const stats = [
    { label: "Reports", value: data.reports.filter((r) => r.kind === "report").length, icon: FileText, to: "/reports", tint: "from-sky-100 to-white text-sky-600" },
    { label: "Medical images", value: data.reports.filter((r) => r.kind === "image").length, icon: FileImage, to: "/reports", tint: "from-violet-100 to-white text-violet-600" },
    { label: "History entries", value: data.history.length, icon: HistoryIcon, to: "/history", tint: "from-amber-100 to-white text-amber-600" },
    { label: "Analyses", value: data.analyses.length, icon: Activity, to: "/analyses", tint: "from-rose-100 to-white text-rose-600" },
  ];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <motion.div key={s.label} whileHover={{ y: -3 }} transition={{ type: "spring", bounce: 0.3, visualDuration: 0.25 }}>
            <Link to={s.to} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-300 hover:shadow-md">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">{s.label}</span>
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${s.tint}`}><s.icon className="h-4 w-4" /></span>
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{s.value}</div>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-2xl lg:col-span-2" title="Start a new analysis" subtitle="Combine symptoms, lab reports and images for an explainable screening summary.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <ul className="space-y-1 text-sm text-slate-600">
              <li>1. Describe your symptoms</li>
              <li>2. Attach reports or images (optional)</li>
              <li>3. Review matches, warning signs and a personalised care plan</li>
            </ul>
            <Link to="/analyses/new" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:-translate-y-0.5 transition">
              <Stethoscope className="h-4 w-4" /> New analysis
            </Link>
          </div>
        </Card>

        <Card className="rounded-2xl" title="Profile completeness">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <UserCircle className="h-8 w-8 text-brand-600" />
              <div className="flex-1"><ProgressBar value={completeness} label="Profile completeness" /></div>
              <span className="text-sm font-medium">{Math.round(completeness * 100)}%</span>
            </div>
            <p className="text-sm text-slate-500">Age, sex, height and weight improve reference ranges and personalised advice.</p>
            <Link to="/profile" className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Update profile <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </Card>
      </div>

      <Card className="rounded-2xl" title="Recent analyses" actions={<Link to="/analyses" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>}>
        {data.analyses.length === 0 ? (
          <EmptyState title="No analyses yet">Run your first analysis to see results here.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.analyses.slice(0, 5).map((a) => (
              <li key={a.id}>
                <Link to={`/analyses/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50">
                  <div>
                    <div className="font-medium text-slate-800">{a.top_condition ?? "No strong match"}</div>
                    <div className="text-xs text-slate-500">{formatDateTime(a.created_at)} · {a.symptom_preview.join(", ") || "Reports only"}</div>
                  </div>
                  <div className="flex gap-2">{a.is_mock && <MockBadge />}<UrgencyBadge urgency={a.urgency} /></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
