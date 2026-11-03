import { useState } from "react";
import { BarChart3, LifeBuoy, Lock } from "lucide-react";
import { Alert, Button, Card, EmptyState, Input, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import type { StaffPatientView, StatRow } from "../lib/types";
import { useAsync } from "../lib/useAsync";

function StatTable({ title, rows, dimLabel }: { title: string; rows: StatRow[]; dimLabel: string }) {
  if (!rows.length) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{title}</h3>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Month</th><th className="py-1 font-medium">{dimLabel}</th><th className="py-1 text-right font-medium">Count</th></tr></thead>
        <tbody>
          {rows.slice(0, 15).map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-1 text-slate-600">{r.period}</td>
              <td className="py-1">{r.dimension}</td>
              <td className="py-1 text-right tabular-nums">{r.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PatientPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, error, reload } = useAsync(() => api.staffPatient(id), [id]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try { await fn(); setMsg({ kind: "success", text: ok }); setEdits({}); reload(); }
    catch (e) { setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" }); }
  }
  if (loading) return <Spinner />;
  if (error || !data) return <Alert kind="error">{error ?? "Not available"}</Alert>;
  const d: StaffPatientView = data;
  return (
    <Card title={`${d.patient.full_name} (${d.patient.email})`} subtitle={`Access granted until ${formatDateTime(d.grant.expires_at)}. Every view and change is shown to the patient.`}
      actions={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="space-y-5 text-sm">
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <p className="flex items-center gap-2 text-xs text-slate-500"><Lock className="h-3.5 w-3.5" /> {d.not_available}</p>
        <Input placeholder="Note for the patient's activity log (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        {d.reports.map((r) => (
          <div key={r.id}>
            <h3 className="mb-1 font-semibold text-slate-900">{r.title} · {formatDate(r.report_date)}</h3>
            <table className="w-full text-left">
              <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Test</th><th className="py-1 font-medium">Value</th><th className="py-1 font-medium">Read from</th><th /></tr></thead>
              <tbody>
                {r.lab_values.map((v) => {
                  const k = `${r.id}:${v.key}`;
                  return (
                    <tr key={k} className="border-t border-slate-100 align-top">
                      <td className="py-1">{v.test}</td>
                      <td className="py-1 tabular-nums">{v.value} {v.unit}{v.corrected ? <span className="ml-1 text-xs text-amber-700">(corrected)</span> : null}</td>
                      <td className="py-1 font-mono text-xs text-slate-500">{v.raw}</td>
                      <td className="py-1">
                        <div className="flex gap-1">
                          <Input aria-label={`New value for ${v.test}`} className="w-24" type="number" step="any" value={edits[k] ?? ""} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
                          <Button variant="secondary" disabled={!edits[k]} onClick={() => void save(() => api.staffCorrectLab(d.patient.id, r.id, v.key, Number(edits[k]), note || null), `${v.test} corrected.`)}>Fix</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {d.history.length > 0 && (
          <div>
            <h3 className="mb-1 font-semibold text-slate-900">Medical history</h3>
            <ul className="space-y-1">
              {d.history.map((h) => {
                const k = `h:${h.id}`;
                return (
                  <li key={h.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 text-xs text-slate-500">{h.category}</span>
                    <span className="flex-1">{h.title}</span>
                    <Input aria-label={`New title for ${h.title}`} className="w-48" value={edits[k] ?? ""} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} placeholder="Corrected title" />
                    <Button variant="secondary" disabled={!edits[k]} onClick={() => void save(() => api.staffFixHistory(d.patient.id, h.id, { title: edits[k], note: note || null }), "History entry corrected.")}>Fix</Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function StaffPage() {
  const { user } = useAuth();
  const stats = useAsync(() => api.staffStats(), []);
  const requests = useAsync(() => api.staffRequests(), []);
  const [open, setOpen] = useState<number | null>(null);
  if (user?.role !== "staff") return <Alert kind="error">This page is for BookMyCare staff only.</Alert>;

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Anonymous reports across all patients, and support for patients who have asked for help." />

      <Card title={<span className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-brand-600" /> Support requests</span>}
        subtitle="Patients appear here only while they allow support access. Without it, their data cannot be opened.">
        {requests.loading ? <Spinner /> : !requests.data?.length ? <p className="text-sm text-slate-500">No patient currently allows support access.</p> : (
          <ul className="space-y-2 text-sm">
            {requests.data.map((r) => (
              <li key={r.patient_id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{r.email}{r.reason ? <span className="text-slate-500"> - "{r.reason}"</span> : null}</span>
                <span className="text-xs text-slate-500">until {formatDateTime(r.expires_at)}</span>
                <Button variant="secondary" onClick={() => setOpen(r.patient_id)}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open !== null && <PatientPanel id={open} onClose={() => { setOpen(null); requests.reload(); }} />}

      <Card title={<span className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600" /> Anonymous statistics</span>} subtitle={stats.data?.note}>
        {stats.loading ? <Spinner /> : stats.error || !stats.data ? <Alert kind="error">{stats.error ?? "Could not load"}</Alert> : (
          <div className="space-y-6">
            <p className="text-sm">Patients: <span className="font-semibold tabular-nums">{stats.data.totals.patients}</span></p>
            {stats.data.not_yet_counted && (stats.data.not_yet_counted.files + stats.data.not_yet_counted.analyses + stats.data.not_yet_counted.accounts) > 0 && (
              <Alert kind="info" title="Older data still being added">
                {stats.data.not_yet_counted.files} file(s), {stats.data.not_yet_counted.analyses} analysis(es) and {stats.data.not_yet_counted.accounts} account(s)
                from before statistics existed are not counted yet. Each is added, in the month it happened, the next time its owner signs in
                (their data is encrypted with their own key until then).
              </Alert>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <StatTable title="Analyses by urgency" rows={stats.data.totals.analyses_by_month_and_urgency} dimLabel="Urgency" />
              <StatTable title="Lab results stored (by test)" rows={stats.data.totals.lab_results_by_test} dimLabel="Test" />
              <StatTable title="Files stored (by kind)" rows={stats.data.totals.files_by_kind} dimLabel="Kind" />
              {stats.data.counters.map((m) => <StatTable key={m.metric} title={m.label} rows={m.rows} dimLabel="Category" />)}
            </div>
            {!stats.data.counters.length && <EmptyState title="No anonymous counters yet">They fill up as patients upload reports and run analyses.</EmptyState>}
          </div>
        )}
      </Card>
    </div>
  );
}
