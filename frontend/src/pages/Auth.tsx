import { Suspense, lazy, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { signInReason } from "../lib/api";
import { validatePassword } from "../lib/password";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Brain, Eye, EyeOff, FileSearch, HeartPulse, ShieldCheck } from "lucide-react";
import { Logo } from "../components/Layout";
import { FallbackVisual } from "../components/immersive/ImmersiveStory";
import { prefersReducedMotion, shouldRender3D, useIdleReady, usePageVisible } from "../components/three/webgl";
import { Alert, Button, Field, Input } from "../components/ui";
import { useAuth } from "../lib/auth";

const StoryCanvas = lazy(() => import("../components/three/StoryCanvas"));

function AuthScene() {
  const [webgl] = useState(shouldRender3D);
  const idle = useIdleReady();
  const visible = usePageVisible();
  const [calm] = useState(prefersReducedMotion);
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(110%_90%_at_30%_40%,#0e7490_0%,#0b4f57_40%,#042f35_72%,#021a1f_100%)]" />
      <div className="bmc-aurora absolute -left-1/4 top-[-20%] h-[80%] w-[70%] rounded-full bg-teal-400/25 blur-[120px]" />
      <div className="bmc-aurora absolute bottom-[-30%] right-[-10%] h-[70%] w-[60%] rounded-full bg-cyan-300/15 blur-[120px]" style={{ animationDelay: "-7s" }} />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(55%_55%_at_30%_50%,black,transparent)]" />
      <div className="pointer-events-auto absolute inset-0">
        {webgl ? (idle ? <Suspense fallback={null}><StoryCanvas mode="auth" calm={calm} active={visible} /></Suspense> : null) : <div className="absolute inset-0 lg:right-1/2"><FallbackVisual scene={0} /></div>}
      </div>
    </div>
  );
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-[#021a1f] text-white">
      <AuthScene />
      <div className="pointer-events-none relative z-10 mx-auto grid min-h-svh max-w-7xl grid-rows-[auto_1fr] gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_440px] lg:grid-rows-1 lg:items-center lg:gap-12 lg:py-10">
        <div className="flex flex-col justify-between self-stretch lg:py-4">
          <div className="pointer-events-auto flex items-center justify-between gap-4 lg:justify-start lg:gap-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="BookMyCare home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg shadow-teal-500/30"><HeartPulse className="h-5 w-5" aria-hidden /></span>
            <span className="text-lg font-semibold">BookMy<span className="text-cyan-300">Care</span></span>
          </Link>
          <Link to="/" className="relative z-10 inline-flex items-center gap-1.5 rounded-xl bg-[#05343a] px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-black/30 ring-1 ring-white/25 transition hover:-translate-x-0.5 hover:bg-[#0a4a52]">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Home
          </Link>
          </div>
          <div className="mt-[42svh] max-w-xl lg:mt-auto">
            <h2 className="text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              Understand Your Health.{" "}
              <span className="bg-gradient-to-r from-teal-200 via-cyan-300 to-sky-300 bg-clip-text text-transparent">Feel More Confident.</span>
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-teal-50/80">
              Upload medical reports, explore understandable health insights and discover personalized guidance in one place.
            </p>
            <ul className="mt-5 hidden flex-wrap gap-2 text-xs font-medium sm:flex">
              {[
                { icon: FileSearch, t: "Plain-language lab reports" },
                { icon: Brain, t: "Explainable screening" },
                { icon: ShieldCheck, t: "WHO & CDC guidance" },
              ].map((f) => (
                <li key={f.t} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/20 backdrop-blur">
                  <f.icon className="h-3.5 w-3.5 text-cyan-200" aria-hidden /> {f.t}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-5 hidden text-xs text-teal-100/60 lg:block">Educational prototype - not a medical device and not a substitute for a doctor.</p>
        </div>

        <main className="pointer-events-auto">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", bounce: 0.2, visualDuration: 0.6, delay: 0.1 }}
            className="relative rounded-[32px] bg-white/95 p-6 text-slate-800 shadow-[0_40px_120px_-30px_rgba(34,211,238,.55)] ring-1 ring-white/60 backdrop-blur-2xl sm:p-8"
          >
            <div className="space-y-6">
              <Logo />
              <div>
                <h1 className="text-2xl font-bold text-slate-900 sm:text-[1.75rem]">{title}</h1>
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              </div>
              {children}
            </div>
          </motion.div>
          <p className="mt-4 text-center text-xs text-teal-100/70 lg:hidden">Educational prototype - not a medical device and not a substitute for a doctor.</p>
        </main>
      </div>
    </div>
  );
}

function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-400 hover:text-teal-700">
        {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [reason] = useState(signInReason.take); // e.g. "please sign in again to unlock your data"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password); // GuestOnly redirects once the user is set
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Welcome back" subtitle="Sign in to your BookMyCare account.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {reason && !error && <Alert kind="info">{reason}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <p className="-mt-2 text-right text-sm"><Link to="/reset-password" className="font-medium text-brand-700 hover:underline">Forgot password?</Link></p>
        <Button type="submit" className="w-full rounded-xl py-3 bg-gradient-to-r from-teal-600 to-sky-500 shadow-lg shadow-teal-600/25 hover:from-teal-700 hover:to-sky-600" loading={busy} disabled={!email || !password}>Sign in</Button>
      </form>
      <p className="text-sm text-slate-600">New here? <Link to="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link></p>
    </Shell>
  );
}

export { validatePassword };

export function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwError = password ? validatePassword(password) : null;
  const mismatch = confirm && confirm !== password ? "Passwords do not match." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pwError || mismatch || !agree) return;
    setError(null);
    setBusy(true);
    try {
      await register(email, name, password); // GuestOnly redirects to /profile
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Create your account" subtitle="Your reports are encrypted with your own key. Only you can open them.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label="Full name" htmlFor="name">
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters with a letter and a number." error={pwError}>
          <PasswordInput id="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={mismatch}>
          <PasswordInput id="confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          I understand BookMyCare is an educational tool and does not provide medical diagnoses.
        </label>
        <Button type="submit" className="w-full rounded-xl py-3 bg-gradient-to-r from-teal-600 to-sky-500 shadow-lg shadow-teal-600/25 hover:from-teal-700 hover:to-sky-600" loading={busy} disabled={!name || !email || !password || !!pwError || !!mismatch || !agree}>
          Create account
        </Button>
      </form>
      <p className="text-sm text-slate-600">Already registered? <Link to="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link></p>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwError = password ? validatePassword(password) : null;
  const mismatch = confirm && confirm !== password ? "Passwords do not match." : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pwError || mismatch) return;
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email, code, password); // signs in; the new recovery code is shown once
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Reset your password" subtitle="Use the recovery code you saved when you created your account.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert kind="error">{error}</Alert>}
        <Alert kind="info">Your reports are encrypted with your own key. The recovery code unlocks it, so nothing is lost. Without the code, nobody (including the BookMyCare team) can open your files.</Alert>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Recovery code" htmlFor="code" hint="Six groups of five characters, e.g. ABCDE-FGHJK-…">
          <Input id="code" autoComplete="off" spellCheck={false} required value={code} onChange={(e) => setCode(e.target.value)} className="font-mono uppercase" />
        </Field>
        <Field label="New password" htmlFor="password" hint="At least 8 characters with a letter and a number." error={pwError}>
          <PasswordInput id="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={mismatch}>
          <PasswordInput id="confirm" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full rounded-xl py-3" loading={busy} disabled={!email || !code || !password || !!pwError || !!mismatch}>Reset password</Button>
      </form>
      <p className="text-sm text-slate-600">Remembered it? <Link to="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link></p>
    </Shell>
  );
}
