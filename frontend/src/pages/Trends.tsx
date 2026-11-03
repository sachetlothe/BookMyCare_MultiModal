import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, LineChart, Minus, Pill } from "lucide-react";
import TrendChart, { STATUS_TEXT } from "../components/TrendChart";
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { LabTrend, TrendAssessment } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const ASSESS: Record<TrendAssessment, { label: string; className: string; icon: typeof AlertTriangle }> = {
  worsening: { label: "Getting worse", className: "bg-red-50 text-red-700", icon: AlertTriangle },
  approaching_limit: { label: "Nearing a limit", className: "bg-amber-50 text-amber-800", icon: AlertTriangle },
  improving: { label: "Improving", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  stable: { label: "No clear change", className: "bg-slate-100 text-slate-700", icon: Minus },
  single_result: { label: "One result", className: "bg-slate-100 text-slate-600", icon: Minus },
};

export function AssessmentBadge({ a }: { a: TrendAssessment }) {
  const m = ASSESS[a];
  const Icon = m.icon;
  return <Badge className={m.className}><Icon className="h-3.5 w-3.5" aria-hidden />{m.label}</Badge>;
}

function TrendCard({ t }: { t: LabTrend }) {
  const unit = t.unit === "%" ? "%" : ` ${t.unit}`;
  // a change in a percentage value (e.g. HbA1c) is in percentage points, not percent
  const changeUnit = t.unit === "%" ? (Math.abs(t.change ?? 0) === 1 ? " percentage point" : " percentage points") : unit;
  return (
    <Card
      title={t.name}
      subtitle={[t.category, t.loinc ? `LOINC ${t.loinc}` : null, `${t.n} results`].filter(Boolean).join(" · ")}
      actions={<AssessmentBadge a={t.assessment} />}
    >
      <p className="text-sm text-slate-700">{t.summary}</p>
      <div className="mt-1 text-xs text-slate-500">
        Latest {t.latest.value}{unit} ({STATUS_TEXT[t.latest.status].toLowerCase()}) on {formatDate(t.latest.date)}
        {t.change !== null && <> · change {t.change > 0 ? "+" : ""}{Math.round(t.change * 100) / 100}{changeUnit}{t.change_pct !== null && ` (${t.change_pct > 0 ? "+" : ""}${t.change_pct}%)`}</>}
      </div>
      {t.flags.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {t.flags.map((f) => <li key={f.kind} className="flex gap-2"><span aria-hidden className="text-slate-400">•</span>{f.text}</li>)}
        </ul>
      )}
      <div className="mt-3"><TrendChart trend={t} /></div>
      {t.events.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 flex items-center gap-1 font-medium text-slate-700"><Pill className="h-3.5 w-3.5" aria-hidden /> Recorded in your history during this period</div>
          {t.events.map((e) => <div key={e.date + e.title}>{formatDate(e.date)} · {e.title} ({e.category})</div>)}
          <div className="mt-1 text-slate-500">Shown for context only; it does not mean this caused the change.</div>
        </div>
      )}
    </Card>
  );
}

export default function TrendsPage() {
  const { data, loading, error } = useAsync(() => api.getTrends(), []);
  if (loading) return <Spinner />;
  if (error || !data) return <Alert kind="error">{error ?? "Could not load trends"}</Alert>;

  const history = data.tests.filter((t) => t.n >= 2);
  const single = data.tests.filter((t) => t.n < 2);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lab trends"
        description="How your results change across reports. Built from the values read from each report, so the original files stay sealed."
      />
      {data.tests.length === 0 ? (
        <EmptyState icon={<LineChart className="h-8 w-8" />} title="No lab results yet">
          Upload lab reports with their report dates on the <Link to="/reports" className="text-brand-700 underline">Reports</Link> page. Trends appear once a test has two or more results.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><div className="text-3xl font-semibold tabular-nums text-slate-900">{data.with_history}</div><div className="text-sm text-slate-600">tests with two or more results</div></Card>
            <Card><div className="text-3xl font-semibold tabular-nums text-slate-900">{data.needs_attention}</div><div className="text-sm text-slate-600">getting worse or nearing a limit</div></Card>
            <Card><div className="text-3xl font-semibold tabular-nums text-slate-900">{single.length}</div><div className="text-sm text-slate-600">tests with only one result</div></Card>
          </div>
          {data.needs_attention > 0 && (
            <Alert kind="warning" title="Discuss these changes with a doctor">
              Some results are moving away from the typical range. A trend is not a diagnosis; a clinician can check whether it matters for you.
            </Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            {history.map((t) => <TrendCard key={t.code} t={t} />)}
          </div>
          {single.length > 0 && (
            <Card title="Only one result so far" subtitle="Add a later report with the same test to see a trend.">
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {single.map((t) => (
                  <li key={t.code} className="flex justify-between gap-3">
                    <span>{t.name}</span>
                    <span className="tabular-nums text-slate-600">{t.latest.value}{t.unit === "%" ? "%" : ` ${t.unit}`} · {formatDate(t.latest.date)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs text-slate-500">{data.note}</p>
        </>
      )}
    </div>
  );
}
