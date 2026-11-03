import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, HeartPulse, LayoutDashboard, LogIn, Menu, X } from "lucide-react";
import ImmersiveStory, { GlowButton, SCENE, scrollToScene } from "../components/immersive/ImmersiveStory";
import { AboutSection, FeaturesSection, SimpleModeSection } from "../components/immersive/HomeShowcase";
import { cx } from "../components/ui";
import { useAuth } from "../lib/auth";

type NavItem = { label: string; go: () => void };

function BrandLink() {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-white" aria-label="BookMyCare home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg shadow-teal-500/30"><HeartPulse className="h-5 w-5" aria-hidden /></span>
      <span className="text-lg font-semibold tracking-tight">BookMy<span className="text-cyan-300">Care</span></span>
    </Link>
  );
}

const loginCls =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(20,184,166,.9)] ring-1 ring-white/20 transition hover:-translate-y-0.5 hover:from-teal-400 hover:to-teal-500 hover:shadow-[0_12px_30px_-8px_rgba(45,212,191,1)] active:translate-y-0";
const startCls =
  "items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_8px_24px_-10px_rgba(255,255,255,.6)] transition hover:-translate-y-0.5 hover:bg-cyan-50 active:translate-y-0";

function PublicNav({ items, signedIn }: { items: NavItem[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const auth = signedIn ? (
    <Link to="/dashboard" className={loginCls}><LayoutDashboard className="h-4 w-4" aria-hidden /> Dashboard</Link>
  ) : (
    <Link to="/login" className={loginCls}><LogIn className="h-4 w-4" aria-hidden /> Login</Link>
  );

  return (
    <header className={cx("fixed inset-x-0 top-0 z-50 transition-colors duration-300", scrolled || open ? "bg-[#021a1f]/70 shadow-[0_10px_30px_-20px_rgba(0,0,0,.8)] backdrop-blur-xl" : "bg-transparent")}>
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandLink />
        <ul className="hidden items-center gap-1 lg:flex">
          {items.map((it) => (
            <li key={it.label}>
              <button type="button" onClick={it.go} className="group relative rounded-lg px-3 py-2 text-sm font-medium text-teal-50/80 transition hover:text-white">
                {it.label}
                <span className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-gradient-to-r from-teal-300 to-cyan-300 transition-transform group-hover:scale-x-100" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          {auth}
          {!signedIn && <Link to="/register" className={cx(startCls, "hidden sm:inline-flex")}>Get Started <ArrowRight className="h-4 w-4" aria-hidden /></Link>}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="public-menu"
            className="rounded-xl p-2 text-white ring-1 ring-white/20 hover:bg-white/10 lg:hidden">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div id="public-menu" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-white/10 lg:hidden">
            <ul className="space-y-1 px-4 py-3">
              {items.map((it) => (
                <li key={it.label}>
                  <button type="button" onClick={() => { setOpen(false); it.go(); }} className="w-full rounded-xl px-3 py-2.5 text-left text-base font-medium text-teal-50/90 hover:bg-white/10">{it.label}</button>
                </li>
              ))}
              {!signedIn && (
                <li className="pt-2"><Link to="/register" className={cx(startCls, "flex w-full justify-center py-3")}>Get Started <ArrowRight className="h-4 w-4" aria-hidden /></Link></li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/** Public homepage: the full 3D story, features and about - no sign-in required. */
export default function HomePage() {
  const { user } = useAuth();
  const storyRef = useRef<HTMLElement>(null);

  const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const items: NavItem[] = [
    { label: "Home", go: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
    { label: "How It Works", go: () => scrollToScene(storyRef.current, SCENE.confusion) },
    { label: "Features", go: () => scrollToId("features") },
    { label: "About", go: () => scrollToId("about-section") },
    { label: "Languages", go: () => scrollToScene(storyRef.current, SCENE.language) },
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <PublicNav items={items} signedIn={!!user} />
      <main>
        <ImmersiveStory sectionRef={storyRef} frame="public" guest={!user} firstName={user?.full_name.split(" ")[0]} />

        <div id="features" className="scroll-mt-16"><FeaturesSection /></div>
        <SimpleModeSection />
        <div id="about-section" className="scroll-mt-16"><AboutSection /></div>

        <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8 lg:pb-10">

          <section aria-labelledby="cta" className="relative overflow-hidden rounded-[36px] bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 px-6 py-12 text-center text-white shadow-[0_40px_100px_-40px_rgba(13,148,136,.8)] sm:px-12">
            <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-teal-300/25 blur-3xl" aria-hidden />
            <h2 id="cta" className="relative text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to understand your health?</h2>
            <p className="relative mx-auto mt-3 max-w-xl text-teal-50/85">Upload your first report and see it explained in plain language.</p>
            <div className="relative mt-7 flex flex-wrap justify-center gap-3">
              {user ? (
                <GlowButton to="/dashboard">Go to your dashboard</GlowButton>
              ) : (
                <>
                  <GlowButton to="/register">Get Started</GlowButton>
                  <GlowButton variant="glass" to="/login" icon={LogIn}>Login</GlowButton>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
