"use client";

import { useMemo, useState } from "react";

const STEPS = [
  { id: "basics", label: "01 Basics" },
  { id: "payload", label: "02 Payload" },
  { id: "rules", label: "03 Rules" },
  { id: "pricing", label: "04 Pricing" },
  { id: "geo", label: "05 Geo + Compliance" },
  { id: "returns", label: "06 Returns" },
  { id: "review", label: "07 Review" },
] as const;

const PROFILES = [
  { id: "short", title: "Short Form", hint: "8 fields · fastest conversion" },
  { id: "standard", title: "Standard", hint: "13 fields · balanced intent" },
  { id: "full", title: "Full Form", hint: "24 fields · underwriting ready" },
] as const;

export type OfferBuilderSchema = { id: string; version: number };
export type OfferBuilderDraft = {
  schema_version_id?: string;
  lead_type?: string;
  pricing_mode?: string;
  price?: string;
  floor?: string;
  ceiling?: string;
  states_include?: string;
  states_exclude?: string;
  zips_include?: string;
  zips_exclude?: string;
  max_lead_age_minutes?: string;
  verification?: string;
  min_quality_score?: string;
  return_window_hours?: string;
  return_reasons?: string;
  require_consent?: boolean;
  field_profile?: string;
};

export default function OfferBuilderFields({
  offerName, schemas, leadTypes, pricingModes, draft, submitLabel,
}: {
  offerName: string;
  schemas: OfferBuilderSchema[];
  leadTypes: readonly string[];
  pricingModes: readonly string[];
  draft: OfferBuilderDraft;
  submitLabel: string;
}) {
  const [step, setStep] = useState<(typeof STEPS)[number]["id"]>("payload");
  const [profile, setProfile] = useState(draft.field_profile || "short");
  const [leadType, setLeadType] = useState(draft.lead_type || "exclusive");
  const [pricing, setPricing] = useState(draft.pricing_mode || "fixed");
  const [price, setPrice] = useState(draft.price || "");
  const [states, setStates] = useState(draft.states_include || "");
  const [consent, setConsent] = useState(Boolean(draft.require_consent));
  const [returnHours, setReturnHours] = useState(draft.return_window_hours || "72");
  const [leadAge, setLeadAge] = useState(draft.max_lead_age_minutes || "5");
  const previewName = useMemo(() => {
    const p = PROFILES.find((x) => x.id === profile);
    return `${offerName} — ${p?.title ?? "Offer"}`;
  }, [offerName, profile]);

  return (
    <div className="ob">
      <ol className="obSteps" aria-label="Offer builder steps">
        {STEPS.map((s) => (
          <li key={s.id}>
            <button type="button" className={step === s.id ? "on" : ""} onClick={() => setStep(s.id)}>{s.label}</button>
          </li>
        ))}
      </ol>
      <div className="obLayout">
        <div className="obMain dashPanel">
          {step === "payload" && (
            <section>
              <header><span>STEP 02 / PAYLOAD CONTRACT</span><h2>Choose the data this offer sells</h2></header>
              <label>Canonical schema
                <select name="schema_version_id" defaultValue={draft.schema_version_id ?? schemas[0]?.id}>
                  {schemas.map((s) => <option key={s.id} value={s.id}>schema v{s.version} (published)</option>)}
                </select>
              </label>
              <p className="obLabel">Field profiles</p>
              <input type="hidden" name="field_profile" value={profile} />
              <div className="obProfiles">
                {PROFILES.map((p) => (
                  <button key={p.id} type="button" className={profile === p.id ? "obProfile on" : "obProfile"} onClick={() => setProfile(p.id)}>
                    <b>{p.title}</b><small>{p.hint}</small>{profile === p.id && <em>Active</em>}
                  </button>
                ))}
              </div>
              <p className="obLabel">Base qualification rules</p>
              <div className="obRule"><span>Age</span><span>between</span><input name="age_min" defaultValue="25" /><input name="age_max" defaultValue="70" /></div>
              <div className="obRule"><span>Coverage amount</span><span>at least</span><input name="coverage_min" defaultValue="100000" /></div>
              <div className="obRule"><span>TCPA consent</span><span>equals</span><input name="verification" defaultValue={draft.verification || "Verified"} /></div>
            </section>
          )}
          {step === "rules" && (
            <section>
              <header><span>STEP 03 / RULES</span><h2>Buyer controls that gate delivery</h2></header>
              <div className="formGrid">
                <label>Lead type<select name="lead_type" value={leadType} onChange={(e) => setLeadType(e.target.value)}>{leadTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                <label>Min quality score<input name="min_quality_score" type="number" defaultValue={draft.min_quality_score} /></label>
                <label>Max lead age (minutes)<input name="max_lead_age_minutes" type="number" value={leadAge} onChange={(e) => setLeadAge(e.target.value)} /></label>
              </div>
            </section>
          )}
          {step === "pricing" && (
            <section>
              <header><span>STEP 04 / PRICING</span><h2>Economics advertisers pay</h2></header>
              <div className="formGrid">
                <label>Pricing mode<select name="pricing_mode" value={pricing} onChange={(e) => setPricing(e.target.value)}>{pricingModes.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                <label>Price ($)<input name="price" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                <label>Floor ($)<input name="floor" defaultValue={draft.floor} /></label>
                <label>Ceiling ($)<input name="ceiling" defaultValue={draft.ceiling} /></label>
              </div>
            </section>
          )}
          {step === "geo" && (
            <section>
              <header><span>STEP 05 / GEO + COMPLIANCE</span><h2>Where the offer can run</h2></header>
              <div className="formGrid">
                <label className="wide">Include states<input name="states_include" value={states} onChange={(e) => setStates(e.target.value)} /></label>
                <label className="wide">Exclude states<input name="states_exclude" defaultValue={draft.states_exclude} /></label>
                <label>Include ZIPs<input name="zips_include" defaultValue={draft.zips_include} /></label>
                <label>Exclude ZIPs<input name="zips_exclude" defaultValue={draft.zips_exclude} /></label>
                <label className="inlineCheck"><input type="checkbox" name="require_consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Require TCPA consent evidence</label>
              </div>
            </section>
          )}
          {step === "returns" && (
            <section>
              <header><span>STEP 06 / RETURNS</span><h2>When a lead can come back</h2></header>
              <div className="formGrid">
                <label>Return window (hours)<input name="return_window_hours" type="number" value={returnHours} onChange={(e) => setReturnHours(e.target.value)} /></label>
                <label className="wide">Accepted return reasons<input name="return_reasons" defaultValue={draft.return_reasons} /></label>
              </div>
            </section>
          )}
          {(step === "basics" || step === "review") && (
            <section>
              <header><span>STEP 07 / REVIEW</span><h2>Confirm terms before saving the draft</h2></header>
              <ul className="obReview">
                <li><span>Product</span><b>{previewName}</b></li>
                <li><span>Lead type</span><b>{leadType}</b></li>
                <li><span>Pricing</span><b>{pricing} {price && `$${price}`}</b></li>
                <li><span>Geography</span><b>{states || "Nationwide"}</b></li>
              </ul>
            </section>
          )}
          {step !== "payload" && (
            <>
              <input type="hidden" name="schema_version_id" defaultValue={draft.schema_version_id ?? schemas[0]?.id} />
              <input type="hidden" name="field_profile" value={profile} />
              <input type="hidden" name="verification" defaultValue={draft.verification || "Verified"} />
            </>
          )}
          {step !== "rules" && (
            <>
              <input type="hidden" name="lead_type" value={leadType} />
              <input type="hidden" name="max_lead_age_minutes" value={leadAge} />
            </>
          )}
          {step !== "pricing" && (
            <>
              <input type="hidden" name="pricing_mode" value={pricing} />
              <input type="hidden" name="price" value={price} />
              <input type="hidden" name="floor" defaultValue={draft.floor} />
              <input type="hidden" name="ceiling" defaultValue={draft.ceiling} />
            </>
          )}
          {step !== "geo" && (
            <>
              <input type="hidden" name="states_include" value={states} />
              {consent && <input type="hidden" name="require_consent" value="on" />}
            </>
          )}
          {step !== "returns" && <input type="hidden" name="return_window_hours" value={returnHours} />}
        </div>
        <aside className="obPreview dashPanel">
          <header><span>Live offer preview</span><h2>{previewName}</h2></header>
          <p className="obMeta"><em>{leadType.toUpperCase()}</em><em>{pricing.toUpperCase()}</em></p>
          <dl>
            <div><dt>Buyer price</dt><dd>{price ? `$${Number(price).toFixed(2)}` : "—"}</dd></div>
            <div><dt>Publisher payout</dt><dd>{price ? `$${(Number(price) * 0.85).toFixed(2)}` : "—"}</dd></div>
            <div><dt>Geography</dt><dd>{states || "Nationwide"}</dd></div>
            <div><dt>Max lead age</dt><dd>{leadAge ? `${leadAge} minutes` : "—"}</dd></div>
            <div><dt>Return window</dt><dd>{returnHours ? `${returnHours} hours` : "—"}</dd></div>
          </dl>
          <p className="obLabel">Required fields</p>
          <p className="obFields">First name · Last name · Phone · Email · ZIP · Date of birth · Coverage amount{consent ? " · TCPA consent evidence" : ""}</p>
          <div className="obActions">
            <button type="submit">{submitLabel}</button>
            <button type="button" className="dashGhost" onClick={() => setStep("review")}>Review →</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
