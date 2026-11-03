import { Link } from "react-router-dom";
import { MapPin, Siren, Stethoscope, UserRound } from "lucide-react";
import { Badge, Card, cx } from "./ui";
import type { SpecialtyRecommendations, SpecialtySuggestion } from "../lib/types";

const ROLE: Record<SpecialtySuggestion["role"], { label: string; className: string; icon: typeof Stethoscope }> = {
  emergency: { label: "Go now", className: "bg-red-100 text-red-800", icon: Siren },
  first_line: { label: "Start here", className: "bg-emerald-50 text-emerald-700", icon: Stethoscope },
  specialist: { label: "May be appropriate", className: "bg-sky-50 text-sky-700", icon: UserRound },
};

const SOURCE: Record<SpecialtySuggestion["reasons"][number]["source"], string> = {
  condition: "From this screening",
  trend: "From your lab trend",
  safety: "Safety rules",
};

function Suggestion({ s, findCare }: { s: SpecialtySuggestion; findCare: boolean }) {
  const role = ROLE[s.role];
  const Icon = role.icon;
  return (
    <li className={cx("rounded-lg border p-4", s.role === "emergency" ? "border-red-200 bg-red-50/50" : "border-slate-200")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", s.role === "emergency" ? "text-red-600" : "text-brand-600")} aria-hidden />
          <div>
            <h3 className="font-semibold text-slate-900">{s.doctor}</h3>
            <p className="text-sm text-slate-600">{s.what}</p>
          </div>
        </div>
        <Badge className={role.className}>{role.label}</Badge>
      </div>
      <div className="mt-3 pl-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why</p>
        <ul className="mt-1 space-y-1 text-sm text-slate-700">
          {s.reasons.map((r) => (
            <li key={r.text} className="flex flex-wrap items-baseline gap-2">
              <span className="text-xs text-slate-500">{SOURCE[r.source]}:</span>{r.text}
            </li>
          ))}
        </ul>
        {s.when && <p className="mt-2 text-sm text-slate-600"><span className="font-medium">When:</span> {s.when}</p>}
        {findCare && (
          <Link to={`/care?specialty=${s.code}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
            <MapPin className="h-4 w-4" aria-hidden /> Find nearby {s.role === "emergency" ? "hospitals" : "places"}
          </Link>
        )}
      </div>
    </li>
  );
}

/** Rule-based "which type of doctor" suggestions, each with the reasons that triggered it. */
export default function SpecialtyCard({ rec, title = "Recommended doctor type", findCare = true }: {
  rec: SpecialtyRecommendations; title?: string; findCare?: boolean;
}) {
  return (
    <Card title={<span className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-brand-600" aria-hidden /> {title}</span>}
      subtitle="Chosen by fixed rules from your results, not by AI.">
      {rec.items.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing in your results points to a particular type of doctor. A general physician is the right first contact for any health concern.</p>
      ) : (
        <ul className="space-y-3">{rec.items.map((s) => <Suggestion key={s.code} s={s} findCare={findCare} />)}</ul>
      )}
      <p className="mt-4 text-xs text-slate-500">{rec.note}</p>
    </Card>
  );
}
