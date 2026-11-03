import { useId } from "react";
import { AnimatePresence, motion } from "motion/react";

export type Mood = "hero" | "confused" | "uploading" | "curious" | "happy";

const POSE: Record<Mood, { left: number; right: number; head: number; look: [number, number]; brows: [string, string] }> = {
  hero: { left: 62, right: -18, head: 0, look: [-2, 0],
    brows: ["M93 95 Q106 88 119 94", "M141 94 Q154 88 167 95"] },
  confused: { left: 48, right: -168, head: -7, look: [3, -3],
    brows: ["M93 90 Q106 80 119 89", "M141 98 Q154 96 167 101"] },
  uploading: { left: 112, right: -12, head: 3, look: [-4, 1],
    brows: ["M93 96 Q106 91 119 97", "M141 97 Q154 91 167 96"] },
  curious: { left: 58, right: -24, head: 6, look: [-2, -1],
    brows: ["M93 89 Q106 81 119 88", "M141 88 Q154 81 167 89"] },
  happy: { left: 150, right: -150, head: 0, look: [0, 0],
    brows: ["M93 92 Q106 84 119 91", "M141 91 Q154 84 167 92"] },
};

const spring = { type: "spring" as const, bounce: 0.25, visualDuration: 0.6 };

function Mouth({ mood }: { mood: Mood }) {
  const common = { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.6 }, transition: { duration: 0.2 } };
  const style = { transformBox: "fill-box" as const, transformOrigin: "center" };
  switch (mood) {
    case "confused":
      return <motion.path key="m-confused" {...common} style={style} d="M115 153 q7.5 -6 15 0 t15 0" fill="none" stroke="#7a3328" strokeWidth="4" strokeLinecap="round" />;
    case "uploading":
      return (
        <motion.g key="m-up" {...common} style={style}>
          <path d="M116 148 Q130 160 144 148 Q130 153 116 148Z" fill="#8f2f2a" stroke="#7a3328" strokeWidth="2.5" strokeLinejoin="round" />
        </motion.g>
      );
    case "curious":
      return <motion.ellipse key="m-cur" {...common} style={style} cx="130" cy="152" rx="7" ry="8.5" fill="#8f2f2a" stroke="#7a3328" strokeWidth="2.5" />;
    case "happy":
    case "hero":
      return (
        <motion.g key={`m-${mood}`} {...common} style={style}>
          <path d={mood === "happy" ? "M108 144 Q130 174 152 144 Q130 152 108 144Z" : "M112 146 Q130 166 148 146 Q130 153 112 146Z"} fill="#8f2f2a" stroke="#7a3328" strokeWidth="2.5" strokeLinejoin="round" />
          <path d={mood === "happy" ? "M120 158 Q130 152 140 158 Q130 166 120 158Z" : "M122 155 Q130 151 138 155 Q130 160 122 155Z"} fill="#f27c7c" />
        </motion.g>
      );
  }
}

/** The BookMyCare kid: one consistent, softly shaded character whose pose and expression follow the story. */
export default function Boy({ mood = "hero", className }: { mood?: Mood; className?: string }) {
  const id = useId().replace(/:/g, "");
  const p = POSE[mood];
  const g = (n: string) => `url(#${n}-${id})`;
  const happyEyes = mood === "happy";
  return (
    <svg viewBox="0 0 260 380" className={className} role="img" aria-label={`Illustrated boy looking ${mood === "hero" ? "cheerful" : mood}`}>
      <defs>
        <radialGradient id={`skin-${id}`} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffe3cc" />
          <stop offset="55%" stopColor="#f7c39c" />
          <stop offset="100%" stopColor="#e09a72" />
        </radialGradient>
        <linearGradient id={`hoodie-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={`sleeve-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="45%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={`pants-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="50%" stopColor="#3b5bdb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <radialGradient id={`hair-${id}`} cx="40%" cy="20%" r="80%">
          <stop offset="0%" stopColor="#6b4a36" />
          <stop offset="100%" stopColor="#2b1a12" />
        </radialGradient>
        <radialGradient id={`shoe-${id}`} cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>
        <radialGradient id={`shadow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="130" cy="366" rx="86" ry="13" fill={g("shadow")} />

      <rect x="99" y="266" width="28" height="78" rx="13" fill={g("pants")} />
      <rect x="133" y="266" width="28" height="78" rx="13" fill={g("pants")} />
      <ellipse cx="110" cy="346" rx="22" ry="12" fill={g("shoe")} stroke="#94a3b8" strokeWidth="1.5" />
      <ellipse cx="150" cy="346" rx="22" ry="12" fill={g("shoe")} stroke="#94a3b8" strokeWidth="1.5" />
      <path d="M92 348 h36" stroke="#14b8a6" strokeWidth="4" strokeLinecap="round" />
      <path d="M132 348 h36" stroke="#14b8a6" strokeWidth="4" strokeLinecap="round" />

      <g transform="translate(176 184)">
        <motion.g animate={{ rotate: p.right }} transition={spring} style={{ transformBox: "fill-box", originX: 0.5, originY: 0.06 }}>
          <rect x="-12" y="-6" width="24" height="80" rx="12" fill={g("sleeve")} />
          <rect x="-12" y="62" width="24" height="10" rx="4" fill="#0369a1" opacity="0.5" />
          <circle cx="0" cy="84" r="13" fill={g("skin")} />
        </motion.g>
      </g>

      <path d="M76 208 Q78 168 130 165 Q182 168 184 208 L190 282 Q130 300 70 282 Z" fill={g("hoodie")} />
      <path d="M76 208 Q78 168 130 165 Q120 200 112 290 Q90 288 70 282 Z" fill="#ffffff" opacity="0.12" />
      <path d="M102 240 h56 q5 0 5 5 v25 h-66 v-25 q0-5 5-5z" fill="#0ea5e9" opacity="0.55" />
      <path d="M130 172 v66" stroke="#0369a1" strokeWidth="2.5" strokeDasharray="3 4" opacity="0.6" />
      <path d="M118 172 q-2 18 -6 26 M142 172 q2 18 6 26" stroke="#e0f2fe" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="112" cy="200" r="3" fill="#e0f2fe" />
      <circle cx="148" cy="200" r="3" fill="#e0f2fe" />
      <g transform="translate(150 216)">
        <circle r="10" fill="#ffffff" opacity="0.9" />
        <path d="M0 -5 v10 M-5 0 h10" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
      </g>

      <g transform="translate(84 184)">
        <motion.g animate={{ rotate: p.left }} transition={spring} style={{ transformBox: "fill-box", originX: 0.5, originY: 0.06 }}>
          <rect x="-12" y="-6" width="24" height="80" rx="12" fill={g("sleeve")} />
          <rect x="-12" y="62" width="24" height="10" rx="4" fill="#0369a1" opacity="0.5" />
          <circle cx="0" cy="84" r="13" fill={g("skin")} />
        </motion.g>
      </g>

      <rect x="118" y="150" width="24" height="22" rx="10" fill="#e09a72" />

      <motion.g animate={{ rotate: p.head }} transition={spring} style={{ transformBox: "fill-box", originX: 0.5, originY: 0.95 }}>
        <circle cx="68" cy="118" r="13" fill={g("skin")} />
        <circle cx="192" cy="118" r="13" fill={g("skin")} />
        <circle cx="68" cy="118" r="6" fill="#e09a72" opacity="0.6" />
        <circle cx="192" cy="118" r="6" fill="#e09a72" opacity="0.6" />
        <circle cx="130" cy="110" r="63" fill={g("skin")} />
        <ellipse cx="108" cy="78" rx="26" ry="14" fill="#ffffff" opacity="0.18" />

        <path d="M67 108 Q60 44 128 40 Q198 38 194 104 Q182 82 154 76 Q164 94 142 92 Q122 72 98 84 Q84 92 67 108Z" fill={g("hair")} />
        <path d="M122 44 Q128 20 148 30 Q136 34 136 46Z" fill={g("hair")} />
        <path d="M96 58 Q116 46 138 50" stroke="#8a6248" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.7" />

        <ellipse cx="90" cy="140" rx="11" ry="6.5" fill="#fb7185" opacity="0.35" />
        <ellipse cx="170" cy="140" rx="11" ry="6.5" fill="#fb7185" opacity="0.35" />

        {happyEyes ? (
          <g>
            <path d="M93 121 Q106 106 119 121" stroke="#2b1a12" strokeWidth="5" fill="none" strokeLinecap="round" />
            <path d="M141 121 Q154 106 167 121" stroke="#2b1a12" strokeWidth="5" fill="none" strokeLinecap="round" />
          </g>
        ) : (
          <motion.g
            animate={{ scaleY: [1, 1, 0.1, 1] }}
            transition={{ duration: 4.5, times: [0, 0.93, 0.965, 1], repeat: Infinity }}
            style={{ transformBox: "fill-box", originY: 0.5 }}
          >
            <ellipse cx="106" cy="118" rx={mood === "curious" ? 14 : 13} ry={mood === "curious" ? 17 : 15} fill="#ffffff" />
            <ellipse cx="154" cy="118" rx={mood === "curious" ? 14 : 13} ry={mood === "curious" ? 17 : 15} fill="#ffffff" />
            <motion.g animate={{ x: p.look[0], y: p.look[1] }} transition={spring}>
              <circle cx="106" cy="120" r="8.5" fill="#4a2c1d" />
              <circle cx="154" cy="120" r="8.5" fill="#4a2c1d" />
              <circle cx="106" cy="120" r="4" fill="#120a06" />
              <circle cx="154" cy="120" r="4" fill="#120a06" />
              <circle cx="109" cy="116" r="3" fill="#ffffff" />
              <circle cx="157" cy="116" r="3" fill="#ffffff" />
            </motion.g>
          </motion.g>
        )}

        <motion.path animate={{ d: p.brows[0] }} transition={spring} stroke="#3b2418" strokeWidth="5" fill="none" strokeLinecap="round" />
        <motion.path animate={{ d: p.brows[1] }} transition={spring} stroke="#3b2418" strokeWidth="5" fill="none" strokeLinecap="round" />

        <path d="M126 134 Q130 138 134 134" stroke="#c97f5a" strokeWidth="3" fill="none" strokeLinecap="round" />
        <AnimatePresence mode="wait" initial={false}>
          <Mouth key={mood} mood={mood} />
        </AnimatePresence>
      </motion.g>
    </svg>
  );
}
