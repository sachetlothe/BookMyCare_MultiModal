import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { readSimplePref, writeSimplePref } from "../lib/simpleLabs";
import type { LabValue } from "../lib/types";
import LabTable from "./LabTable";
import SimpleLabView from "./SimpleLabView";
import { cx } from "./ui";

export function SimpleModeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        "no-print group inline-flex items-center gap-3 rounded-full py-1.5 pl-3 pr-1.5 text-sm font-semibold shadow-sm ring-1 transition",
        on ? "bg-gradient-to-r from-sky-500 to-brand-500 text-white ring-transparent" : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-400",
      )}
    >
      <Sparkles className={cx("h-4 w-4", on ? "text-white" : "text-brand-600")} aria-hidden />
      Simple Mode
      <span className={cx("relative block h-6 w-11 shrink-0 rounded-full transition", on ? "bg-white/30" : "bg-slate-200")}>
        <motion.span
          className="absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow"
          animate={{ x: on ? 22 : 2 }}
          transition={{ type: "spring", bounce: 0.25, visualDuration: 0.25 }}
        />
      </span>
    </button>
  );
}

/** Lab results with a Simple Mode switch (everyday language) and the original detailed table. */
export default function LabResults({ labs }: { labs: LabValue[] }) {
  const [simple, setSimple] = useState(readSimplePref);
  const change = (v: boolean) => { setSimple(v); writeSimplePref(v); };
  return (
    <div className="space-y-4">
      {labs.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{simple ? "Everyday explanations with colour meters." : "Detailed medical view."}</p>
          <SimpleModeToggle on={simple} onChange={change} />
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={simple ? "simple" : "detail"}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {simple ? <SimpleLabView labs={labs} /> : <LabTable labs={labs} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
