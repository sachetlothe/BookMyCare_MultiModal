import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Globe, LocateFixed, MapPin, Phone, Search, ShieldAlert, Siren } from "lucide-react";
import SpecialtyCard from "../components/SpecialtyCard";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { FacilitiesResponse, Facility, Place } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const RADII = [2, 5, 10, 25];

interface Loc { lat: number; lon: number; label: string }

const MATCH_CLASS: Record<Facility["match"], string> = {
  listed: "bg-emerald-50 text-emerald-700",
  emergency: "bg-red-50 text-red-700",
  hospital: "bg-sky-50 text-sky-700",
  unknown: "bg-slate-100 text-slate-600",
};

function FacilityItem({ f }: { f: Facility }) {
  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{f.name}</h3>
          <p className="text-sm text-slate-600">
            {f.kind_label} · <span className="tabular-nums">{f.distance_km < 1 ? `${Math.round(f.distance_km * 1000)} m` : `${f.distance_km.toFixed(1)} km`}</span> away (straight line)
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {f.emergency && <Badge className="bg-red-50 text-red-700"><Siren className="h-3.5 w-3.5" aria-hidden />Emergency listed</Badge>}
          <Badge className="bg-amber-50 text-amber-800"><ShieldAlert className="h-3.5 w-3.5" aria-hidden />{f.verification.label}</Badge>
        </div>
      </div>
      <p className="mt-2"><Badge className={MATCH_CLASS[f.match]}>{f.match_text}</Badge></p>
      {f.address && <p className="mt-2 flex gap-2 text-sm text-slate-700"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />{f.address}</p>}
      {f.opening_hours && <p className="mt-1 text-xs text-slate-500">Hours (as listed): {f.opening_hours}</p>}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {f.phone && <a href={`tel:${f.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Phone className="h-4 w-4" aria-hidden />{f.phone}</a>}
        {f.website && <a href={f.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Globe className="h-4 w-4" aria-hidden />Website</a>}
        <a href={f.osm_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-700 hover:underline"><ExternalLink className="h-4 w-4" aria-hidden />View on map</a>
      </div>
    </li>
  );
}

export default function FindCarePage() {
  const [params, setParams] = useSearchParams();
  const specialty = params.get("specialty") ?? "";
  const [radius, setRadius] = useState(5);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [results, setResults] = useState<FacilitiesResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const { data, loading, error } = useAsync(async () => {
    const [suggested, specialties, status] = await Promise.all([
      api.careSuggested(), api.careSpecialties(), api.status().catch(() => null),
    ]);
    return { suggested, specialties, emergencyNumber: status?.emergency_number ?? null };
  }, []);

  useEffect(() => {
    if (!loc) return;
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    api.careFacilities(loc.lat, loc.lon, radius, specialty || null)
      .then((r) => { if (!cancelled) setResults(r); })
      .catch((e: unknown) => { if (!cancelled) { setResults(null); setSearchError(e instanceof Error ? e.message : "Search failed"); } })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [loc, radius, specialty]);

  const setSpecialty = (code: string) => {
    const next = new URLSearchParams(params);
    if (code) next.set("specialty", code); else next.delete("specialty");
    setParams(next, { replace: true });
  };

  const useMyLocation = () => {
    setLocError(null);
    if (!("geolocation" in navigator)) {
      setLocError("Your browser cannot share its location. Search for a place name instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setPlaces(null); setLoc({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Your current location" }); },
      (err) => {
        setLocating(false);
        setLocError(err.code === err.PERMISSION_DENIED
          ? "Location permission was denied. Search for your area or city instead."
          : "Could not get your location. Search for your area or city instead.");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const searchPlace = async (e: FormEvent) => {
    e.preventDefault();
    setLocError(null);
    if (placeQuery.trim().length < 2) return;
    setLocating(true);
    try {
      const r = await api.geocode(placeQuery.trim());
      if (r.results.length === 0) {
        setPlaces(null);
        setLocError("No place found with that name. Try adding the city, e.g. \"Kothrud, Pune\".");
      } else if (r.results.length === 1) {
        setPlaces(null);
        setLoc({ ...r.results[0], label: r.results[0].name });
      } else {
        setPlaces(r.results);
      }
    } catch (err) {
      setLocError(err instanceof Error ? err.message : "Place search failed");
    } finally {
      setLocating(false);
    }
  };

  if (loading) return <Spinner />;
  if (error || !data) return <Alert kind="error">{error ?? "Could not load this page"}</Alert>;

  const chosen = data.specialties.find((s) => s.code === specialty);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Find care"
        description="Which type of doctor may help, based on your results, and places near you that may offer it."
      />

      {specialty === "emergency" && (
        <Alert kind="error" title="If this is an emergency, do not search: call for help now">
          Call {data.emergencyNumber ?? "your local emergency number"} or go to the nearest hospital emergency department.
        </Alert>
      )}

      <SpecialtyCard rec={data.suggested} title="Suggested for you" />

      <Card title="Search nearby" subtitle="Places come from OpenStreetMap, a community-edited map.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Type of care" htmlFor="care-specialty">
            <Select id="care-specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">All hospitals, clinics and doctors</option>
              {data.specialties.map((s) => <option key={s.code} value={s.code}>{s.doctor}</option>)}
            </Select>
          </Field>
          <Field label="Distance" htmlFor="care-radius">
            <Select id="care-radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
              {RADII.map((r) => <option key={r} value={r}>Within {r} km</option>)}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Button type="button" variant="secondary" onClick={useMyLocation} loading={locating && !placeQuery}>
            <LocateFixed className="h-4 w-4" aria-hidden /> Use my current location
          </Button>
          <span className="text-sm text-slate-500">or</span>
          <form onSubmit={searchPlace} className="flex flex-1 flex-wrap items-end gap-2" role="search">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor="care-place" className="sr-only">Area or city</label>
              <Input id="care-place" placeholder="Area or city, e.g. Kothrud, Pune" value={placeQuery} maxLength={120}
                onChange={(e) => setPlaceQuery(e.target.value)} />
            </div>
            <Button type="submit" loading={locating && !!placeQuery}><Search className="h-4 w-4" aria-hidden /> Find place</Button>
          </form>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Your location is rounded to about 1 km before it is sent to OpenStreetMap. Your health information and the type of care you pick are never sent.
        </p>

        {locError && <Alert kind="warning" className="mt-3">{locError}</Alert>}
        {places && (
          <div className="mt-3">
            <p className="text-sm font-medium text-slate-700">Which place did you mean?</p>
            <ul className="mt-2 space-y-1">
              {places.map((p) => (
                <li key={`${p.lat},${p.lon}`}>
                  <button type="button" className="text-left text-sm text-brand-700 hover:underline"
                    onClick={() => { setPlaces(null); setLoc({ ...p, label: p.name }); }}>{p.name}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {loc && (
        <Card
          title={chosen ? `${chosen.doctor}: places near you` : "Places near you"}
          subtitle={<>Near <span className="font-medium text-slate-700">{loc.label}</span>, within {radius} km. Sorted by distance; not ranked by quality.</>}
        >
          {searching ? <Spinner label="Searching the map…" /> : searchError ? (
            <Alert kind="error">{searchError}</Alert>
          ) : results && results.results.length === 0 ? (
            <EmptyState icon={<MapPin className="h-8 w-8" />} title="No matching places found on the map">
              Try a larger distance or "All hospitals, clinics and doctors". Map data can be incomplete in some areas.
            </EmptyState>
          ) : results ? (
            <>
              {results.stale && (
                <Alert kind="info" title="Showing saved results" className="mb-3">
                  The map servers are busy right now, so these are results saved for this area earlier today. Some details may be out of date.
                </Alert>
              )}
              <Alert kind="warning" title="Not verified">{results.verification_note}</Alert>
              <ul className="mt-4 space-y-3">{results.results.map((f) => <FacilityItem key={f.id} f={f} />)}</ul>
              <p className="mt-4 text-xs text-slate-500">
                {results.privacy_note} Map data{" "}
                <a href={results.attribution_url} target="_blank" rel="noopener noreferrer" className="underline">{results.attribution}</a>.
              </p>
            </>
          ) : null}
        </Card>
      )}
    </div>
  );
}
