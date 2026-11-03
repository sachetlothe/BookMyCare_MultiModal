import { useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Droplet, FileText, Loader2, ScanLine, Sparkles, UploadCloud, XCircle, type LucideIcon } from "lucide-react";
import { api } from "../../lib/api";
import { extractionNote, formatBytes } from "../../lib/format";
import { writeSimplePref } from "../../lib/simpleLabs";
import type { ReportDetail } from "../../lib/types";
import { validateFile } from "../../pages/Reports";
import { cx } from "../ui";

export const REPORT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt,.csv";

export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";

export type UploadTargetKey = "blood" | "medical" | "xray";
export const UPLOAD_TARGETS: Record<UploadTargetKey, { label: string; kind: "report" | "image"; reportType: string; icon: LucideIcon; hint: string; accept: string }> = {
  blood: { label: "Blood report", kind: "report", reportType: "blood_test", icon: Droplet, hint: "PDF, PNG, JPG, WEBP, BMP, TIFF, TXT or CSV · max 15 MB", accept: REPORT_ACCEPT },
  medical: { label: "Medical report", kind: "report", reportType: "other", icon: FileText, hint: "PDF, image, TXT or CSV · max 15 MB", accept: REPORT_ACCEPT },
  xray: { label: "X-ray image", kind: "image", reportType: "xray", icon: ScanLine, hint: "PNG, JPG, WEBP, BMP or TIFF · max 15 MB", accept: IMAGE_ACCEPT },
};

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; name: string; size: number }
  | { phase: "done"; report: ReportDetail }
  | { phase: "error"; message: string };

/** Uploads a report or medical image through the existing /api/reports endpoint. */
export function useReportUpload(onUploaded?: (r: ReportDetail) => void) {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [target, setTargetKey] = useState<UploadTargetKey>("blood");
  async function upload(file: File | undefined | null) {
    if (!file) return;
    const t = UPLOAD_TARGETS[target];
    const err = validateFile(file, t.kind);
    if (err) { setState({ phase: "error", message: err }); return; }
    setState({ phase: "uploading", name: file.name, size: file.size });
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", t.kind);
    fd.append("title", file.name.replace(/\.[^.]+$/, ""));
    fd.append("report_type", t.reportType);
    try {
      const r = await api.uploadReport(fd);
      setState({ phase: "done", report: r });
      onUploaded?.(r);
    } catch (e) {
      setState({ phase: "error", message: e instanceof Error ? e.message : "Upload failed" });
    }
  }
  function setTarget(k: UploadTargetKey) { setTargetKey(k); setState({ phase: "idle" }); }
  return { state, upload, target, setTarget, reset: () => setState({ phase: "idle" }) };
}

function doneMessage(r: ReportDetail): string {
  if (r.kind === "image") {
    const q = r.image_features;
    if (!q) return "Image saved.";
    return q.quality_ok ? "Image saved. Quality check passed." : "Image saved, with quality warnings.";
  }
  return r.extraction_status === "done"
    ? `Uploaded! ${r.lab_values.length} lab value(s) recognised.`
    : `Uploaded, but ${extractionNote(r.extraction_status)}.`;
}

export default function UploadPanel({ state, upload, reset, target, setTarget }: ReturnType<typeof useReportUpload>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const busy = state.phase === "uploading";

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    void upload(e.dataTransfer.files?.[0]);
  }

  const t = UPLOAD_TARGETS[target];
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="What are you uploading?" className="grid grid-cols-3 gap-2">
        {(Object.keys(UPLOAD_TARGETS) as UploadTargetKey[]).map((k) => {
          const o = UPLOAD_TARGETS[k];
          const on = k === target;
          return (
            <button key={k} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setTarget(k)}
              className={cx("flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:flex-row sm:justify-center sm:gap-2",
                on ? "bg-gradient-to-br from-sky-500 to-brand-600 text-white shadow-md shadow-sky-500/25" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-sky-300")}>
              <o.icon className="h-4 w-4" aria-hidden /> {o.label}
            </button>
          );
        })}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cx(
          "relative overflow-hidden rounded-2xl border-2 border-dashed p-4 transition",
          drag ? "border-sky-400 bg-sky-50" : "border-sky-200 bg-white/80",
        )}
      >
        <div className="pointer-events-none absolute -inset-10 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.18),transparent_60%)]" aria-hidden />
        <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-brand-500 text-white shadow-lg shadow-sky-500/30">
            <span className="bmc-pulse-ring absolute inset-0 rounded-2xl ring-4 ring-sky-300" aria-hidden />
            {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <UploadCloud className="h-6 w-6" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">{busy ? (t.kind === "image" ? "Checking your image…" : "Reading your report…") : `Drop your ${t.label.replace(/^(Blood|Medical)/, (w) => w.toLowerCase())} here`}</p>
            <p className="text-xs text-slate-500">{t.hint}</p>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-slate-800 disabled:opacity-60"
          >
            <UploadCloud className="h-4 w-4" aria-hidden /> Choose file
          </motion.button>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={t.accept}
            data-testid="story-file-input"
            aria-label={`Choose a ${t.label.replace(/^(Blood|Medical)/, (w) => w.toLowerCase())} to upload`}
            onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {state.phase === "uploading" && (
          <motion.div key="up" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 rounded-xl bg-white/90 p-3 text-sm ring-1 ring-slate-200" role="status">
            <FileText className="h-4 w-4 text-sky-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{state.name} <span className="text-slate-400">({formatBytes(state.size)})</span></span>
            <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-sky-100">
              <motion.span className="absolute inset-y-0 w-1/2 rounded-full bg-sky-500" animate={{ x: ["-100%", "200%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }} />
            </span>
          </motion.div>
        )}
        {state.phase === "done" && (
          <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cx("space-y-2 rounded-xl p-3 text-sm ring-1", state.report.extraction_status === "done" || state.report.image_features?.quality_ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200")} role="status">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              {doneMessage(state.report)}
            </p>
            {state.report.extraction_error && <p className="text-xs">{state.report.extraction_error}</p>}
            {state.report.image_features?.quality_warnings.map((w) => <p key={w} className="text-xs">{w}</p>)}
            <div className="flex flex-wrap gap-2">
              {state.report.kind === "image" ? (
                <Link to={`/reports/${state.report.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:ring-sky-300">
                  <ScanLine className="h-3.5 w-3.5 text-sky-600" aria-hidden /> View image
                </Link>
              ) : (
                <Link to={`/reports/${state.report.id}`} onClick={() => writeSimplePref(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:ring-sky-300">
                  <Sparkles className="h-3.5 w-3.5 text-sky-600" aria-hidden /> See it in Simple Mode
                </Link>
              )}
              <Link to="/analyses/new" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 hover:ring-sky-300">
                Analyse with symptoms
              </Link>
              <button type="button" onClick={reset} className="text-xs font-medium underline">Upload another</button>
            </div>
          </motion.div>
        )}
        {state.phase === "error" && (
          <motion.div key="err" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200" role="alert">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{state.message}</span>
            <button type="button" onClick={reset} className="text-xs font-medium underline">Dismiss</button>
          </motion.div>
        )}
      </AnimatePresence>
      <p className="text-xs text-slate-500">Other image or report types (CT, ultrasound, prescriptions…)? <Link to="/reports" className="font-medium text-brand-700 hover:underline">Open Reports & images</Link></p>
    </div>
  );
}
