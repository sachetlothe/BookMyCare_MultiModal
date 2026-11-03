import { useId, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../ui";

/** A glossy, biconcave red blood cell. */
export function BloodCell({ size = 56, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} style={style} aria-hidden>
      <defs>
        <radialGradient id={`rbc-o-${id}`} cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ff8a8a" />
          <stop offset="60%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#9f1239" />
        </radialGradient>
        <radialGradient id={`rbc-i-${id}`} cx="55%" cy="60%" r="60%">
          <stop offset="0%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="32" rx="29" ry="27" fill={`url(#rbc-o-${id})`} />
      <ellipse cx="33" cy="34" rx="15" ry="13" fill={`url(#rbc-i-${id})`} />
      <path d="M14 22 Q22 10 36 9" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.55" />
    </svg>
  );
}

export interface CellSpec { x: string; y: string; size: number; delay: number; dur: number; tilt: number; blur?: boolean }

/** A field of slowly drifting cells. Pure CSS animation (compositor-only transforms). */
export function CellField({ cells, className }: { cells: CellSpec[]; className?: string }) {
  return (
    <div className={cx("pointer-events-none absolute inset-0", className)} aria-hidden>
      {cells.map((c, i) => (
        <div
          key={i}
          className="bmc-float absolute"
          style={{ left: c.x, top: c.y, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`, ["--tilt" as string]: `${c.tilt}deg` }}
        >
          <BloodCell size={c.size} className={cx("drop-shadow-[0_10px_14px_rgba(190,18,60,0.25)]", c.blur && "opacity-60 blur-[1.5px]")} />
        </div>
      ))}
    </div>
  );
}

/** A glassy floating bubble holding a medical icon. */
export function IconBubble({ icon: Icon, className, tone = "text-brand-600", style }: { icon: LucideIcon; className?: string; tone?: string; style?: CSSProperties }) {
  return (
    <div
      className={cx("bmc-float pointer-events-none absolute flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-lg shadow-sky-900/10 ring-1 ring-white backdrop-blur", className)}
      style={style}
      aria-hidden
    >
      <Icon className={cx("h-6 w-6", tone)} />
    </div>
  );
}

/** Soft gradient blobs used as section backgrounds. */
export function Glow({ className }: { className?: string }) {
  return <div className={cx("pointer-events-none absolute rounded-full blur-3xl", className)} aria-hidden />;
}
