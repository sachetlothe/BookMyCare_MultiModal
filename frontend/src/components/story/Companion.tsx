import { useId } from "react";
import { motion } from "motion/react";

/** "Carey", a friendly heart-shaped care companion that matches the BookMyCare heart logo. */
export default function Companion({ className, waving = true }: { className?: string; waving?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 130" className={className} overflow="visible" aria-hidden>
      <defs>
        <linearGradient id={`hc-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="55%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0f766e" />
        </linearGradient>
        <radialGradient id={`hl-${id}`} cx="35%" cy="25%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="124" rx="30" ry="4" fill="#0f766e" opacity="0.15" />
      <motion.g animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        {/* arms */}
        <path d="M22 70 Q10 74 12 86" stroke="#0f766e" strokeWidth="6" strokeLinecap="round" fill="none" />
        <motion.path
          d="M98 64 Q112 54 108 40" stroke="#0f766e" strokeWidth="6" strokeLinecap="round" fill="none"
          style={{ originX: "98px", originY: "64px" }}
          animate={waving ? { rotate: [0, 14, -6, 14, 0] } : { rotate: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2 }}
        />
        {/* heart body */}
        <path d="M60 112 C30 92 14 74 14 52 C14 36 26 24 41 24 C50 24 56 29 60 36 C64 29 70 24 79 24 C94 24 106 36 106 52 C106 74 90 92 60 112Z" fill={`url(#hc-${id})`} />
        <path d="M60 112 C30 92 14 74 14 52 C14 36 26 24 41 24 C50 24 56 29 60 36 C64 29 70 24 79 24 C94 24 106 36 106 52 C106 74 90 92 60 112Z" fill={`url(#hl-${id})`} />
        {/* face */}
        <ellipse cx="46" cy="56" rx="5" ry="6" fill="#0f172a" />
        <ellipse cx="74" cy="56" rx="5" ry="6" fill="#0f172a" />
        <circle cx="47.5" cy="54" r="1.8" fill="#fff" />
        <circle cx="75.5" cy="54" r="1.8" fill="#fff" />
        <ellipse cx="38" cy="68" rx="6" ry="3.5" fill="#fda4af" opacity="0.7" />
        <ellipse cx="82" cy="68" rx="6" ry="3.5" fill="#fda4af" opacity="0.7" />
        <path d="M52 68 Q60 76 68 68" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" fill="none" />
        {/* stethoscope */}
        <path d="M40 84 Q46 98 60 98 Q74 98 80 84" stroke="#e2e8f0" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="60" cy="100" r="5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
      </motion.g>
    </svg>
  );
}
