import type { LabStatus, Urgency } from "./types";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function rangeText(low: number | null, high: number | null, unit?: string | null): string {
  const u = unit ? ` ${unit}` : "";
  if (low != null && high != null) return `${low} – ${high}${u}`;
  if (high != null) return `≤ ${high}${u}`;
  if (low != null) return `≥ ${low}${u}`;
  return "—";
}

export const urgencyMeta: Record<Urgency, { label: string; className: string; ring: string }> = {
  emergency: { label: "Emergency", className: "bg-red-600 text-white", ring: "border-red-300 bg-red-50 text-red-900" },
  urgent: { label: "Urgent", className: "bg-orange-500 text-white", ring: "border-orange-300 bg-orange-50 text-orange-900" },
  soon: { label: "See a doctor soon", className: "bg-amber-400 text-amber-950", ring: "border-amber-300 bg-amber-50 text-amber-900" },
  routine: { label: "Routine", className: "bg-emerald-600 text-white", ring: "border-emerald-300 bg-emerald-50 text-emerald-900" },
};

export const labStatusMeta: Record<LabStatus, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  low: { label: "Low", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  high: { label: "High", className: "bg-amber-50 text-amber-800 ring-amber-200" },
  critical_low: { label: "Critically low", className: "bg-red-50 text-red-700 ring-red-200" },
  critical_high: { label: "Critically high", className: "bg-red-50 text-red-700 ring-red-200" },
};

export function confidenceClass(c: "low" | "moderate" | "high"): string {
  return { low: "bg-slate-100 text-slate-700", moderate: "bg-sky-100 text-sky-800", high: "bg-brand-100 text-brand-800" }[c];
}

/** Split a comma/newline separated string into a cleaned list. */
export function splitList(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}

/** Plain-English description of a report's text-extraction status (e.g. "the text could not be read"). */
export function extractionNote(status: string): string {
  switch (status) {
    case "failed": return "the text could not be read";
    case "partial": return "only part of the text could be read";
    case "skipped": return "text reading was skipped";
    case "pending": return "text reading has not finished yet";
    default: return `text reading status: ${status}`;
  }
}
