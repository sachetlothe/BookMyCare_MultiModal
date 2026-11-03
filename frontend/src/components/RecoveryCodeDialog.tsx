import { useEffect, useRef, useState } from "react";
import { Copy, Download, KeyRound } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "./ui";

/** Shows a new recovery code exactly once. It cannot be shown again: the server keeps only a locked copy of the key. */
export default function RecoveryCodeDialog() {
  const { recoveryCode, dismissRecoveryCode, user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSaved(false);
    setCopied(false);
    if (recoveryCode) ref.current?.focus();
  }, [recoveryCode]);

  if (!recoveryCode) return null;

  async function copy() {
    try { await navigator.clipboard.writeText(recoveryCode!); setCopied(true); } catch { setCopied(false); }
  }
  function download() {
    const text = `BookMyCare recovery code\nAccount: ${user?.email ?? ""}\nCreated: ${new Date().toLocaleString()}\n\n${recoveryCode}\n\n`
      + "Use it on the 'Forgot password?' page if you ever forget your password.\nKeep it private. Anyone with this code and your email can reset your password.\n";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmycare-recovery-code.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="presentation">
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rc-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl outline-none">
        <h2 id="rc-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900"><KeyRound className="h-5 w-5 text-brand-600" /> Save your recovery code</h2>
        <p className="mt-2 text-sm text-slate-600">
          Your reports are encrypted with a key that only your password unlocks. Not even the BookMyCare team can open them.
          If you forget your password, this code is the <strong>only</strong> way to get back in without losing your files.
        </p>
        <div className="mt-4 select-all rounded-xl border border-slate-200 bg-slate-50 p-4 text-center font-mono text-lg tracking-wider text-slate-900" data-testid="recovery-code">
          {recoveryCode}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={copy}><Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy"}</Button>
          <Button variant="secondary" onClick={download}><Download className="h-4 w-4" /> Download as text file</Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">It will not be shown again. Store it somewhere safe, away from this device (for example printed, or in a password manager).</p>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I have saved my recovery code somewhere safe.
        </label>
        <div className="mt-4 flex justify-end">
          <Button onClick={dismissRecoveryCode} disabled={!saved}>Done</Button>
        </div>
      </div>
    </div>
  );
}
