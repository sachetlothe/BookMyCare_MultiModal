import type { LucideIcon } from "lucide-react";
import {
  Activity, Bandage, Battery, Bone, Candy, Droplets, Factory, Filter, Flame, FlaskConical, Gauge, HeartPulse,
  Recycle, ShieldCheck, Sun, Truck, Waves, Wind, Zap,
} from "lucide-react";
import type { LabStatus, LabValue } from "./types";

export interface SimpleLabInfo {
  icon: LucideIcon;
  nickname: string;
  what: string;
  low?: string;
  high?: string;
  tint: string;
}

/** Everyday-language descriptions for every lab key the backend recognises. */
export const SIMPLE_LABS: Record<string, SimpleLabInfo> = {
  hemoglobin: { icon: Truck, nickname: "Oxygen delivery trucks", tint: "from-rose-100 to-rose-50 text-rose-600",
    what: "Hemoglobin lives inside red blood cells. Like tiny delivery trucks, it carries oxygen from your lungs to every part of your body.",
    low: "Fewer trucks can mean less oxygen gets delivered, which may make you feel tired or breathless. A doctor can find out why.",
    high: "More trucks than usual can happen with dehydration, smoking or living high up in the mountains." },
  wbc: { icon: ShieldCheck, nickname: "Body's security guards", tint: "from-sky-100 to-sky-50 text-sky-600",
    what: "White blood cells are your body's security guards. They patrol your blood and help fight germs and infections.",
    low: "Fewer guards on duty can make it harder to fight germs. A doctor can check what is causing it.",
    high: "Extra guards often show up when your body is fighting an infection or swelling somewhere." },
  platelets: { icon: Bandage, nickname: "Tiny repair helpers", tint: "from-amber-100 to-amber-50 text-amber-600",
    what: "Platelets are tiny repair helpers. When you get a cut, they rush in and stick together to help stop the bleeding.",
    low: "Fewer helpers can mean you bruise or bleed more easily. Some infections, like dengue, can lower them.",
    high: "Extra helpers can appear when your body is dealing with swelling or low iron." },
  hba1c: { icon: Candy, nickname: "3-month sugar diary", tint: "from-fuchsia-100 to-fuchsia-50 text-fuchsia-600",
    what: "HbA1c is like a diary of your blood sugar over the last 3 months, instead of just one moment.",
    high: "A higher number means sugar has been running high for a while. A doctor will usually repeat or confirm this test." },
  glucose_fasting: { icon: Candy, nickname: "Morning sugar check", tint: "from-fuchsia-100 to-fuchsia-50 text-fuchsia-600",
    what: "This measures the sugar (your body's fuel) in your blood after you haven't eaten for 8 or more hours.",
    low: "Low sugar can make you shaky, sweaty or confused - eat something and tell a doctor if it keeps happening.",
    high: "Higher morning sugar can mean your body is finding it harder to handle sugar. It is usually checked again." },
  glucose_random: { icon: Candy, nickname: "Anytime sugar check", tint: "from-fuchsia-100 to-fuchsia-50 text-fuchsia-600",
    what: "This measures your blood sugar (your body's fuel) at any time of day, often after a meal.",
    low: "Low sugar can make you shaky, sweaty or confused.",
    high: "Higher sugar after meals is usually followed up with a fasting sugar or HbA1c test." },
  total_cholesterol: { icon: Droplets, nickname: "Total fat in the pipes", tint: "from-orange-100 to-orange-50 text-orange-600",
    what: "Cholesterol is a waxy fat carried in your blood. Your body needs some, but too much can stick to the walls of your blood 'pipes'.",
    high: "More cholesterol can slowly narrow blood vessels over the years. Food, activity and your doctor's advice can help." },
  ldl: { icon: Droplets, nickname: "The 'sticky' cholesterol", tint: "from-orange-100 to-orange-50 text-orange-600",
    what: "LDL is the kind of cholesterol that can stick to the inside of blood vessels, like grease in a kitchen pipe.",
    high: "Higher LDL means more 'grease' that could build up over time. It is worth discussing with a doctor." },
  hdl: { icon: Recycle, nickname: "The 'clean-up' cholesterol", tint: "from-emerald-100 to-emerald-50 text-emerald-600",
    what: "HDL is the helpful cholesterol. It works like a clean-up crew, carrying extra cholesterol away to the liver.",
    low: "A smaller clean-up crew is linked with a higher heart risk. Activity often helps raise it." },
  triglycerides: { icon: Flame, nickname: "Stored energy fats", tint: "from-orange-100 to-orange-50 text-orange-600",
    what: "Triglycerides are fats that store spare energy from food, especially sugar, sweets and alcohol.",
    high: "Higher levels are often linked to diet, alcohol or blood sugar - a doctor can explain what fits for you." },
  creatinine: { icon: Filter, nickname: "Kidney filter check", tint: "from-indigo-100 to-indigo-50 text-indigo-600",
    what: "Creatinine is a waste product from your muscles. Your kidneys act like filters and wash it out.",
    low: "Lower values are usually less concerning and can happen with smaller muscle mass.",
    high: "A higher number can mean the kidney filters are working less well. A doctor can check further." },
  urea: { icon: Filter, nickname: "Body's waste meter", tint: "from-indigo-100 to-indigo-50 text-indigo-600",
    what: "Urea is a waste product made when your body breaks down protein. Your kidneys remove it.",
    high: "Higher urea can come from not drinking enough water or from the kidneys working harder." },
  tsh: { icon: Gauge, nickname: "Body's speed controller", tint: "from-violet-100 to-violet-50 text-violet-600",
    what: "TSH is a messenger from your brain that tells your thyroid gland how fast to run your body's 'engine'.",
    low: "Low TSH can mean the thyroid engine is running too fast.",
    high: "High TSH often means the brain is pushing a slow thyroid to work harder." },
  alt: { icon: Factory, nickname: "Liver health signal", tint: "from-lime-100 to-lime-50 text-lime-700",
    what: "ALT is a helper found mostly inside liver cells - your body's busy cleaning factory.",
    high: "When liver cells are irritated, more ALT leaks into the blood. Many things can cause this, so a doctor checks why." },
  ast: { icon: Factory, nickname: "Liver & muscle signal", tint: "from-lime-100 to-lime-50 text-lime-700",
    what: "AST is a helper found in the liver and in muscles.",
    high: "More AST in the blood can come from the liver or from muscles, even after hard exercise." },
  bilirubin_total: { icon: Sun, nickname: "Yellow colour recycler", tint: "from-yellow-100 to-yellow-50 text-yellow-700",
    what: "Bilirubin is a yellow substance made when old red blood cells are recycled. The liver clears it.",
    high: "Too much can make skin or eyes look yellow. A doctor can find out where it is coming from." },
  vitamin_d: { icon: Sun, nickname: "Sunshine vitamin", tint: "from-yellow-100 to-yellow-50 text-yellow-700",
    what: "Vitamin D is the 'sunshine vitamin'. It helps keep your bones and muscles strong.",
    low: "Low vitamin D is very common. It can affect bones and muscles - ask a doctor how to bring it back up.",
    high: "Very high vitamin D usually comes from taking a lot of supplements." },
  vitamin_b12: { icon: Zap, nickname: "Nerve & blood helper", tint: "from-cyan-100 to-cyan-50 text-cyan-700",
    what: "Vitamin B12 helps make healthy red blood cells and keeps your nerves working well.",
    low: "Low B12 can cause tiredness or tingling in hands and feet." },
  ferritin: { icon: Battery, nickname: "Iron savings account", tint: "from-rose-100 to-rose-50 text-rose-600",
    what: "Ferritin shows how much iron your body has saved up - like an iron savings account.",
    low: "A low balance means iron stores are running low, which can lead to fewer oxygen trucks (hemoglobin).",
    high: "A high number can happen with swelling in the body or extra iron." },
  sodium: { icon: Waves, nickname: "Salt & water balance", tint: "from-sky-100 to-sky-50 text-sky-600",
    what: "Sodium helps balance the water in your body and helps nerves and muscles work.",
    low: "Low sodium can cause tiredness, headache or confusion.",
    high: "High sodium often means the body is short of water." },
  potassium: { icon: HeartPulse, nickname: "Heartbeat helper", tint: "from-pink-100 to-pink-50 text-pink-600",
    what: "Potassium is a mineral that helps your heart beat steadily and your muscles move.",
    low: "Low potassium can cause weakness or cramps.",
    high: "High potassium can affect the heartbeat, so doctors like to check it quickly." },
  crp: { icon: Flame, nickname: "Body's fire alarm", tint: "from-red-100 to-red-50 text-red-600",
    what: "CRP is like a fire alarm. It goes up when there is swelling (inflammation) or infection somewhere.",
    high: "The alarm is ringing - but it does not say where. A doctor looks at the rest of the picture." },
  esr: { icon: Activity, nickname: "Swelling speedometer", tint: "from-red-100 to-red-50 text-red-600",
    what: "ESR measures how fast red cells settle in a tube. It speeds up when there is swelling in the body.",
    high: "A faster number is a general sign of inflammation, not of one specific illness." },
  uric_acid: { icon: Bone, nickname: "Joint crystal check", tint: "from-stone-100 to-stone-50 text-stone-600",
    what: "Uric acid is a waste product from breaking down some foods. Kidneys wash it out.",
    low: "Low uric acid is usually not a concern.",
    high: "Too much can form tiny crystals in joints (gout) or kidney stones." },
  spo2: { icon: Wind, nickname: "Oxygen fuel gauge", tint: "from-sky-100 to-sky-50 text-sky-600",
    what: "SpO2 shows how full of oxygen your blood is - like a fuel gauge for oxygen.",
    low: "A low reading needs prompt medical attention, especially if you feel breathless." },
  heart_rate: { icon: HeartPulse, nickname: "Heartbeat counter", tint: "from-pink-100 to-pink-50 text-pink-600",
    what: "This is how many times your heart beats in one minute while resting.",
    low: "A slow heartbeat can be normal for very fit people, but should be checked if you feel dizzy.",
    high: "A fast heartbeat can come from fever, stress, caffeine or not enough fluids." },
  bp_systolic: { icon: Gauge, nickname: "Pipe pressure (squeeze)", tint: "from-red-100 to-red-50 text-red-600",
    what: "The top blood pressure number: how hard blood pushes on the 'pipes' when your heart squeezes.",
    low: "Low pressure can make you feel dizzy when standing up.",
    high: "High pressure that stays high over time makes the heart and pipes work harder." },
  bp_diastolic: { icon: Gauge, nickname: "Pipe pressure (rest)", tint: "from-red-100 to-red-50 text-red-600",
    what: "The bottom blood pressure number: the pressure in your 'pipes' while your heart rests between beats.",
    high: "A raised resting pressure over repeated readings is worth discussing with a doctor." },
};

const FALLBACK: SimpleLabInfo = {
  icon: FlaskConical, nickname: "Lab test", tint: "from-slate-100 to-slate-50 text-slate-600",
  what: "A measurement from your lab report. Your doctor can explain what it means for you.",
};

export function simpleInfo(key: string): SimpleLabInfo {
  return SIMPLE_LABS[key] ?? FALLBACK;
}

export type Zone = "low" | "normal" | "high";

export interface MeterSegment { zone: Zone; from: number; to: number }
export interface Meter {
  segments: MeterSegment[];
  /** 0..1 position of the value along the bar */
  position: number;
  /** value lies beyond the drawn scale */
  offScale: "below" | "above" | null;
}

/** Build a colour meter purely from the reference range that came with the lab value.
 *  Returns null when the lab has no range, so nothing is invented. */
export function buildMeter(value: number, low: number | null, high: number | null): Meter | null {
  let min: number;
  let max: number;
  if (low != null && high != null && high > low) {
    const span = high - low;
    min = Math.max(0, low - span * 0.6);
    max = high + span * 0.6;
  } else if (high != null && low == null && high > 0) {
    min = 0;
    max = high * 1.6;
  } else if (low != null && high == null && low > 0) {
    min = 0;
    max = low * 2;
  } else {
    return null;
  }
  const at = (v: number) => (v - min) / (max - min);
  const segments: MeterSegment[] = [];
  if (low != null) segments.push({ zone: "low", from: 0, to: at(low) });
  segments.push({ zone: "normal", from: low != null ? at(low) : 0, to: high != null ? at(high) : 1 });
  if (high != null) segments.push({ zone: "high", from: at(high), to: 1 });
  const raw = at(value);
  return {
    segments: segments.filter((s) => s.to > s.from),
    position: Math.min(1, Math.max(0, raw)),
    offScale: raw < 0 ? "below" : raw > 1 ? "above" : null,
  };
}

export function zoneOf(status: LabStatus): Zone {
  if (status === "low" || status === "critical_low") return "low";
  if (status === "high" || status === "critical_high") return "high";
  return "normal";
}

export const ZONE_STYLE: Record<Zone, { bar: string; chip: string; label: string }> = {
  low: { bar: "bg-rose-300", chip: "bg-rose-50 text-rose-700 ring-rose-200", label: "Lower than the typical range" },
  normal: { bar: "bg-emerald-300", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Within the typical range" },
  high: { bar: "bg-orange-300", chip: "bg-orange-50 text-orange-700 ring-orange-200", label: "Higher than the typical range" },
};

export function simpleSummary(labs: LabValue[]): { inRange: number; outside: number; critical: number } {
  let inRange = 0;
  let outside = 0;
  let critical = 0;
  for (const l of labs) {
    if (l.status === "normal") inRange++;
    else outside++;
    if (l.status.startsWith("critical")) critical++;
  }
  return { inRange, outside, critical };
}

const SIMPLE_KEY = "bmc_simple_mode";
export function readSimplePref(): boolean {
  try { return localStorage.getItem(SIMPLE_KEY) === "1"; } catch { return false; }
}
export function writeSimplePref(on: boolean): void {
  try { localStorage.setItem(SIMPLE_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
