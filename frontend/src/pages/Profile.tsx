import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import SecurityCard from "../components/SecurityCard";
import SupportAccessCard from "../components/SupportAccessCard";
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Select, Spinner, Textarea } from "../components/ui";
import { api } from "../lib/api";
import { splitList } from "../lib/format";
import type { Profile } from "../lib/types";
import { useAsync } from "../lib/useAsync";

type ListKey = "allergies" | "chronic_conditions" | "current_medications";

export default function ProfilePage() {
  const location = useLocation() as { state?: { welcome?: boolean } };
  const { data, loading, error } = useAsync(() => api.getProfile());
  const [form, setForm] = useState<Profile | null>(null);
  const [lists, setLists] = useState<Record<ListKey, string>>({ allergies: "", chronic_conditions: "", current_medications: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
      setLists({
        allergies: data.allergies.join(", "),
        chronic_conditions: data.chronic_conditions.join(", "),
        current_medications: data.current_medications.join(", "),
      });
    }
  }, [data]);

  if (loading) return <Spinner />;
  if (error || !form) return <Alert kind="error">{error ?? "Could not load profile"}</Alert>;

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setForm({ ...form, [k]: v });
  const num = (v: string) => (v === "" ? null : Number(v));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMsg(null);
    try {
      const saved = await api.updateProfile({
        ...form,
        allergies: splitList(lists.allergies),
        chronic_conditions: splitList(lists.chronic_conditions),
        current_medications: splitList(lists.current_medications),
      });
      setForm(saved);
      setMsg({ kind: "success", text: "Profile saved." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="My profile" description="Used to personalise reference ranges, risk factors and care recommendations." />
      {location.state?.welcome && <Alert kind="info" className="mb-4" title="Welcome to BookMyCare!">Complete your profile to get more relevant results. All fields are optional.</Alert>}
      <form onSubmit={submit} className="space-y-6">
        <Card title="Basic details">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date of birth" htmlFor="dob" hint={form.age != null ? `Age ${form.age}` : undefined}>
              <Input id="dob" type="date" max={new Date().toISOString().slice(0, 10)} value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value || null)} />
            </Field>
            <Field label="Sex" htmlFor="sex" hint="Used for sex-specific lab ranges.">
              <Select id="sex" value={form.sex ?? ""} onChange={(e) => set("sex", (e.target.value || null) as Profile["sex"])}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Blood group" htmlFor="bg">
              <Select id="bg" value={form.blood_group ?? ""} onChange={(e) => set("blood_group", e.target.value || null)}>
                <option value="">Unknown</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((g) => <option key={g}>{g}</option>)}
              </Select>
            </Field>
            <Field label="Height (cm)" htmlFor="h">
              <Input id="h" type="number" min={30} max={260} step="0.1" value={form.height_cm ?? ""} onChange={(e) => set("height_cm", num(e.target.value))} />
            </Field>
            <Field label="Weight (kg)" htmlFor="w" hint={form.bmi != null ? `BMI ${form.bmi}` : undefined}>
              <Input id="w" type="number" min={1} max={400} step="0.1" value={form.weight_kg ?? ""} onChange={(e) => set("weight_kg", num(e.target.value))} />
            </Field>
            <Field label="Emergency contact" htmlFor="ec">
              <Input id="ec" maxLength={200} value={form.emergency_contact ?? ""} onChange={(e) => set("emergency_contact", e.target.value || null)} />
            </Field>
          </div>
        </Card>

        <Card title="Lifestyle">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Physical activity" htmlFor="act">
              <Select id="act" value={form.activity_level ?? ""} onChange={(e) => set("activity_level", (e.target.value || null) as Profile["activity_level"])}>
                <option value="">Not specified</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option>
              </Select>
            </Field>
            <Field label="Alcohol" htmlFor="alc">
              <Select id="alc" value={form.alcohol_use ?? ""} onChange={(e) => set("alcohol_use", (e.target.value || null) as Profile["alcohol_use"])}>
                <option value="">Not specified</option><option value="none">None</option><option value="occasional">Occasional</option><option value="regular">Regular</option>
              </Select>
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <Checkbox label="I smoke / use tobacco" checked={form.smoker} onChange={(e) => set("smoker", e.target.checked)} />
              {form.sex === "female" && <Checkbox label="I am currently pregnant" checked={form.is_pregnant} onChange={(e) => set("is_pregnant", e.target.checked)} />}
            </div>
          </div>
        </Card>

        <Card title="Medical background" subtitle="Separate items with commas.">
          <div className="grid gap-4 md:grid-cols-3">
            {([
              ["allergies", "Allergies", "e.g. Penicillin, Peanuts"],
              ["chronic_conditions", "Long-term conditions", "e.g. Hypertension, Asthma"],
              ["current_medications", "Current medicines", "e.g. Metformin"],
            ] as [ListKey, string, string][]).map(([k, label, ph]) => (
              <Field key={k} label={label} htmlFor={k}>
                <Textarea id={k} rows={3} placeholder={ph} value={lists[k]} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </Card>

        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        <div className="flex justify-end"><Button type="submit" loading={saving}>Save profile</Button></div>
      </form>
      <div className="mt-6 space-y-6"><SecurityCard /><SupportAccessCard /></div>
    </div>
  );
}
