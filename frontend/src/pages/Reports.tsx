import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { FileImage, FileText, UploadCloud } from "lucide-react";
import { ExtractionBadge } from "../components/badges";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, cx } from "../components/ui";
import { api } from "../lib/api";
import { extractionNote, formatBytes, formatDate } from "../lib/format";
import type { ReportSummary } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const REPORT_TYPES = [
  ["blood_test", "Blood test"], ["urine_test", "Urine test"], ["imaging_report", "Imaging report"],
  ["prescription", "Prescription"], ["discharge_summary", "Discharge summary"], ["other", "Other"],
];
const IMAGE_TYPES = [["xray", "X-ray"], ["ct_mri", "CT / MRI"], ["ultrasound", "Ultrasound"], ["skin_photo", "Skin photo"], ["eye_photo", "Eye photo"], ["other", "Other"]];
const MAX_MB = 15;

export function validateFile(file: File, kind: "report" | "image"): string | null {
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_MB * 1024 * 1024) return `File is larger than ${MAX_MB} MB.`;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const imageExt = ["png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"];
  const allowed = kind === "image" ? imageExt : [...imageExt, "pdf", "txt", "csv"];
  if (!allowed.includes(ext)) return kind === "image" ? "Medical images must be PNG, JPG, WEBP, BMP or TIFF." : "Upload a PDF, image, TXT or CSV file.";
  return null;
}

export default function ReportsPage() {
  const { data, setData, loading, error } = useAsync(() => api.listReports());
  const [kind, setKind] = useState<"report" | "image">("report");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [rtype, setRtype] = useState("blood_test");
  const [rdate, setRdate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "warning"; text: string; id?: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    const err = validateFile(f, kind);
    setMsg(err ? { kind: "error", text: err } : null);
    setFile(err ? null : f);
    if (!err && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file || !data) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    if (title) fd.append("title", title);
    fd.append("report_type", rtype);
    if (rdate) fd.append("report_date", rdate);
    try {
      const r = await api.uploadReport(fd);
      setData([{ ...r, lab_count: r.lab_values.length }, ...data]);
      const text = r.kind === "image"
        ? "Image uploaded. Quality checks complete."
        : r.extraction_status === "done"
          ? `Uploaded. ${r.lab_values.length} lab value(s) recognised.`
          : `Uploaded, but ${extractionNote(r.extraction_status)}${r.extraction_error ? `: ${r.extraction_error}` : "."}`;
      setMsg({ kind: r.extraction_status === "done" ? "success" : "warning", text, id: r.id });
      setFile(null);
      setTitle("");
      setRdate("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Upload failed" });
    } finally {
      setBusy(false);
    }
  }

  const types = kind === "image" ? IMAGE_TYPES : REPORT_TYPES;

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & images" description="Upload lab reports (PDF, scanned image, or text) and medical images. Text is extracted automatically and lab values are recognised." />

      <Card title="Upload">
        <form onSubmit={submit} className="space-y-4">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
            {(["report", "image"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => { setKind(k); setFile(null); setRtype(k === "image" ? "xray" : "blood_test"); }}
                className={cx("rounded-md px-4 py-1.5 text-sm font-medium", kind === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
              >
                {k === "report" ? "Medical report" : "Medical image"}
              </button>
            ))}
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={cx("flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
              drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50")}
          >
            <UploadCloud className="h-8 w-8 text-brand-600" />
            <p className="text-sm text-slate-600">
              {file ? <><span className="font-medium text-slate-800">{file.name}</span> ({formatBytes(file.size)})</> : "Drag & drop a file here, or"}
            </p>
            <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>{file ? "Choose another file" : "Browse files"}</Button>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              data-testid="file-input"
              accept={kind === "image" ? "image/*" : ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.csv"}
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <p className="text-xs text-slate-500">{kind === "image" ? "PNG, JPG, WEBP, BMP, TIFF" : "PDF, PNG, JPG, TXT, CSV"} · max {MAX_MB} MB</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Title" htmlFor="title"><Input id="title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Type" htmlFor="rtype">
              <Select id="rtype" value={rtype} onChange={(e) => setRtype(e.target.value)}>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </Field>
            <Field label="Date" htmlFor="rdate"><Input id="rdate" type="date" max={new Date().toISOString().slice(0, 10)} value={rdate} onChange={(e) => setRdate(e.target.value)} /></Field>
          </div>

          {kind === "image" && (
            <Alert kind="info">Images are checked for quality. If a vision-capable AI provider (Gemini) is configured, it can add unverified observations; BookMyCare does not include a trained diagnostic imaging model.</Alert>
          )}
          {msg && (
            <Alert kind={msg.kind}>
              {msg.text} {msg.id && <Link className="font-medium underline" to={`/reports/${msg.id}`}>View details</Link>}
            </Alert>
          )}
          <div className="flex justify-end"><Button type="submit" loading={busy} disabled={!file}>Upload</Button></div>
        </form>
      </Card>

      <Card title="Your files">
        {loading ? <Spinner /> : error ? <Alert kind="error">{error}</Alert> : !data?.length ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="No files uploaded yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map((r: ReportSummary) => (
              <li key={r.id}>
                <Link to={`/reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-slate-50">
                  <div className="flex min-w-0 items-center gap-3">
                    {r.kind === "image" ? <FileImage className="h-5 w-5 shrink-0 text-violet-600" /> : <FileText className="h-5 w-5 shrink-0 text-brand-600" />}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">{r.title}</div>
                      <div className="text-xs text-slate-500">{formatDate(r.report_date ?? r.created_at)} · {r.original_filename} · {formatBytes(r.size_bytes)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{r.kind === "image" ? "Image" : "Report"}</Badge>
                    {r.kind === "report" && <ExtractionBadge status={r.extraction_status} />}
                    {r.lab_count > 0 && <Badge className="bg-brand-50 text-brand-800">{r.lab_count} lab values</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
