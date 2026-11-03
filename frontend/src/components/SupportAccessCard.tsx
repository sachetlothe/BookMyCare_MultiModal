import { useState, type FormEvent } from "react";
import { History, LifeBuoy } from "lucide-react";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner } from "./ui";

const ACTION_LABEL: Record<string, string> = {
  support_access_granted: "Support access allowed",
  support_access_revoked: "Support access withdrawn",
  support_viewed: "Support viewed your data",
  lab_value_corrected: "Lab value corrected",
  history_corrected: "History entry corrected",
};

/** Patient-controlled, time-limited access for BookMyCare support, with a full activity log. */
export default function SupportAccessCard() {
  const { data, setData, loading, error } = useAsync(() => api.supportStatus(), []);
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(fn: () => Promise<typeof data>) {
    setBusy(true);
    setMsg(null);
    try { setData(await fn()); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  const grant = (e: FormEvent) => { e.preventDefault(); void act(() => api.grantSupport(Number(hours), reason || null)); };

  return (
    <Card title={<span className="flex items-center gap-2"><LifeBuoy className="h-5 w-5 text-brand-600" /> Support access</span>}
      subtitle="Only if you need help (for example a value was read wrongly). You decide if and for how long the BookMyCare team may see and correct your data.">
      {loading ? <Spinner /> : error || !data ? <Alert kind="error">{error ?? "Could not load"}</Alert> : (
        <div className="space-y-5">
          {msg && <Alert kind="error">{msg}</Alert>}
          {data.active ? (
            <div className="space-y-3">
              <Alert kind="warning" title="Support can currently see your data">
                Until {formatDateTime(data.expires_at!)}{data.reason ? ` - "${data.reason}"` : ""}. They see your profile, history and lab values, never your original files or full report text.
              </Alert>
              <Button variant="danger" loading={busy} onClick={() => void act(() => api.revokeSupport())}>Withdraw access now</Button>
            </div>
          ) : (
            <form onSubmit={grant} className="flex flex-wrap items-end gap-2">
              <Field label="Allow for" htmlFor="sa-hours">
                <Select id="sa-hours" value={hours} onChange={(e) => setHours(e.target.value)}>
                  <option value="1">1 hour</option>
                  <option value="24">24 hours</option>
                  <option value="72">3 days</option>
                </Select>
              </Field>
              <Field label="What do you need help with? (optional)" htmlFor="sa-reason">
                <Input id="sa-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. my HbA1c was read wrongly" />
              </Field>
              <Button type="submit" variant="secondary" loading={busy}>Allow support access</Button>
            </form>
          )}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> Activity on your data</h3>
            {data.log.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
              <ul className="space-y-2 text-sm">
                {data.log.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-start gap-2">
                    <span className="w-40 shrink-0 text-xs text-slate-500">{formatDateTime(e.created_at)}</span>
                    <Badge className={e.actor_role === "staff" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}>{e.actor_role === "staff" ? "Support" : "You"}</Badge>
                    <span className="min-w-0 flex-1 text-slate-700">{ACTION_LABEL[e.action] ?? e.action}{e.detail ? `: ${e.detail}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
