import { useId } from "react";
import { ScanLine } from "lucide-react";
import { cx } from "../ui";

/**
 * A stylised chest X-ray panel used as decoration. It is an illustration only:
 * it never shows findings, and is labelled so nobody reads it as a real image.
 */
export default function XRay3D({ scanning = false, tilt = -6, label = "Example", className }: {
  scanning?: boolean; tilt?: number; label?: string; className?: string;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <div className={cx("bmc-perspective", className)} aria-hidden>
      <div className="bmc-preserve relative" style={{ transform: `rotateY(${tilt}deg) rotateX(4deg)` }}>
        <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[18px] bg-slate-900/25 blur-md" />
        <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-2.5 shadow-[0_24px_50px_-18px_rgba(15,23,42,0.6)] ring-1 ring-white/10">
          <div className="mb-1.5 flex items-center justify-between gap-1.5 px-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap"><ScanLine className="h-3 w-3" /> X-ray</span>
            <span className="min-w-0 truncate rounded-full bg-white/10 px-1.5 py-px text-[7px] tracking-wider text-white/70">{label}</span>
          </div>
          <div className="relative overflow-hidden rounded-xl bg-black">
            <svg viewBox="0 0 120 130" className="block w-full">
              <defs>
                <radialGradient id={`lung-${id}`} cx="50%" cy="45%" r="60%">
                  <stop offset="0%" stopColor="#0b1220" />
                  <stop offset="100%" stopColor="#1e293b" />
                </radialGradient>
                <radialGradient id={`glow-${id}`} cx="50%" cy="40%" r="70%">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#020617" />
                </radialGradient>
              </defs>
              <rect width="120" height="130" fill={`url(#glow-${id})`} />
              <path d="M56 22 C40 24 26 40 24 70 C22 96 30 112 46 114 C54 112 56 100 56 86Z" fill={`url(#lung-${id})`} opacity="0.95" />
              <path d="M64 22 C80 24 94 40 96 70 C98 96 90 112 74 114 C66 112 64 100 64 86Z" fill={`url(#lung-${id})`} opacity="0.95" />
              <g stroke="#cbd5e1" strokeOpacity="0.55" fill="none" strokeLinecap="round">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <g key={i}>
                    <path d={`M58 ${32 + i * 11} C44 ${28 + i * 11} 30 ${34 + i * 11} 24 ${46 + i * 11}`} strokeWidth="2.2" />
                    <path d={`M62 ${32 + i * 11} C76 ${28 + i * 11} 90 ${34 + i * 11} 96 ${46 + i * 11}`} strokeWidth="2.2" />
                  </g>
                ))}
                <path d="M58 20 C46 16 34 18 22 24" strokeWidth="3" strokeOpacity="0.7" />
                <path d="M62 20 C74 16 86 18 98 24" strokeWidth="3" strokeOpacity="0.7" />
              </g>
              <rect x="57" y="12" width="6" height="118" rx="3" fill="#e2e8f0" opacity="0.6" />
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => <rect key={i} x="56" y={16 + i * 12} width="8" height="2" rx="1" fill="#0f172a" opacity="0.5" />)}
              <path d="M54 72 C50 88 56 100 70 102 C80 100 82 88 74 78 C68 72 60 70 54 72Z" fill="#94a3b8" opacity="0.25" />
            </svg>
            {scanning && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[10%]">
                <div className="bmc-scan h-full w-full bg-gradient-to-b from-transparent via-cyan-300/60 to-transparent shadow-[0_0_18px_4px_rgba(34,211,238,0.45)]" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_40%)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
