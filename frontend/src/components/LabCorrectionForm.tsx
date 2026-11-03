import { useState, type FormEvent } from "react";
import { PencilLine } from "lucide-react";
import { api } from "../lib/api";
import type { LabValue, ReportDetail } from "../lib/types";
import { Alert, Button, Field, Input, Select } from "./ui";

/** Lets the patient fix a value that was read wrongly. The change is recorded in their activity log. */
export default function LabCorrectionForm({ report, onSaved }: { report: ReportDetail; onSaved: (r: ReportDetail) => void }) {
  const labs: LabValue[] = report.lab_values;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(labs[0]?.key ?? "");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  if (!labs.length) return null;
  const current = labs.find((l) => l.key === code);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = Number(value);
    if (!code || value.trim() === "" || Number.isNaN(v)) return;
    setBusy(true);
    setMsg(null);
    try {
      onSaved(await api.correctLab(report.id, code, v));
      setMsg({ kind: "success", text: "Saved. Your trends and future analyses use the corrected value." });
      setValue("");
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
        <PencilLine className="h-4 w-4" /> A value was read wrongly? Correct it
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Test" htmlFor="fix-test">
          <Select id="fix-test" value={code} onChange={(e) => setCode(e.target.value)}>
            {labs.map((l) => <option key={l.key} value={l.key}>{l.test}</option>)}
          </Select>
        </Field>
        <Field label={`Correct value${current?.unit ? ` (${current.unit})` : ""}`} htmlFor="fix-value" hint={current ? `Currently ${current.value}` : undefined}>
          <Input id="fix-value" type="number" step="any" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" loading={busy} disabled={value.trim() === ""}>Save correction</Button>
      </div>
      {current?.raw && <p className="text-xs text-slate-500">Read from: <span className="font-mono">{current.raw}</span></p>}
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
    </form>
  );
}
