import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";
import type { SecurityStatus } from "../lib/types";
import { validatePassword } from "../lib/password";
import { Alert, Button, Card, Field, Input } from "./ui";

export default function SecurityCard() {
  const { createRecoveryCode, changePassword, logoutEverywhere, hasRecoveryCode } = useAuth();
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [codePw, setCodePw] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"code" | "password" | "all" | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const nextError = next ? validatePassword(next) : null;

  useEffect(() => { api.securityStatus().then(setStatus).catch(() => setStatus(null)); }, [hasRecoveryCode]);

  async function run(kind: "code" | "password" | "all", fn: () => Promise<void>, ok: string) {
    setBusy(kind);
    setMsg(null);
    try { await fn(); setMsg({ kind: "success", text: ok }); }
    catch (e) { setMsg({ kind: "error", text: e instanceof Error ? e.message : "Failed" }); }
    finally { setBusy(null); }
  }
  const submitCode = (e: FormEvent) => { e.preventDefault(); void run("code", async () => { await createRecoveryCode(codePw); setCodePw(""); }, "New recovery code created. Any older code no longer works."); };
  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (nextError) return;
    void run("password", async () => { await changePassword(current, next); setCurrent(""); setNext(""); }, "Password changed. Your files stay readable, and other devices have been signed out.");
  };

  return (
    <div id="security" className="scroll-mt-6">
      <Card title={<span className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-600" /> Account security</span>}
        subtitle="Your reports, results and history are encrypted with your own key. Only your password or your recovery code can unlock it.">
        <div className="space-y-6">
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

          <form onSubmit={submitCode} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><KeyRound className="h-4 w-4" /> Recovery code</h3>
            <p className="text-sm text-slate-600">
              {status?.has_recovery_code
                ? <>You have a recovery code{status.recovery_created_at ? ` (created ${formatDate(status.recovery_created_at)})` : ""}. Creating a new one replaces it.</>
                : <span className="text-amber-800">You have no recovery code. If you forget your password, your files cannot be recovered by anyone.</span>}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Confirm with your password" htmlFor="rc-password">
                <Input id="rc-password" type="password" autoComplete="current-password" value={codePw} onChange={(e) => setCodePw(e.target.value)} />
              </Field>
              <Button type="submit" variant="secondary" loading={busy === "code"} disabled={!codePw}>{status?.has_recovery_code ? "Create new recovery code" : "Create recovery code"}</Button>
            </div>
          </form>

          <form onSubmit={submitPassword} className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Change password</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current password" htmlFor="cur-password">
                <Input id="cur-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
              </Field>
              <Field label="New password" htmlFor="new-password" hint="At least 8 characters with a letter and a number." error={nextError}>
                <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" variant="secondary" loading={busy === "password"} disabled={!current || !next || !!nextError}>Change password</Button>
          </form>

          <div className="space-y-2 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Sessions</h3>
            <p className="text-sm text-slate-600">Sign out on every device, including this one, for example after using a shared computer.</p>
            <Button variant="secondary" loading={busy === "all"} onClick={() => void run("all", logoutEverywhere, "")}><LogOut className="h-4 w-4" /> Sign out everywhere</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
