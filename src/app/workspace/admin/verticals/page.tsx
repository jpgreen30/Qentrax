import { redirect } from "next/navigation";
import Link from "next/link";
import WorkspaceShell from "@/components/WorkspaceShell";
import { createClient } from "@/lib/supabase/server";
import { FIELD_TYPES, FIELD_PHASES, CONSENT_CLASSES } from "@/lib/offers/field-input";
import {
  createVertical,
  updateVertical,
  createSchemaDraft,
  addField,
  deleteField,
  reorderField,
  publishSchemaVersion,
} from "./actions";

type SchemaVersion = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  notes: string | null;
  published_at: string | null;
};

type FieldRow = {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  required: boolean;
  phase: string;
  is_pii: boolean;
  consent_classification: string;
  enum_values: string[] | null;
  sort_order: number;
};

export default async function AdminVerticals({
  searchParams,
}: {
  searchParams: Promise<{ vertical?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/workspace");

  const { data: verticals } = await supabase
    .from("verticals")
    .select("id, code, name, description, active")
    .order("name");

  const selectedId = params.vertical ?? verticals?.[0]?.id ?? null;
  const selected = (verticals ?? []).find((v) => v.id === selectedId) ?? null;

  let versions: SchemaVersion[] = [];
  let fields: FieldRow[] = [];
  let draft: SchemaVersion | null = null;

  if (selected) {
    const { data: versionRows } = await supabase
      .from("vertical_schema_versions")
      .select("id, version, status, notes, published_at")
      .eq("vertical_id", selected.id)
      .order("version", { ascending: false });

    versions = (versionRows ?? []) as SchemaVersion[];
    draft = versions.find((v) => v.status === "draft") ?? null;

    // Show the draft when one is open, otherwise the newest published version.
    const showing = draft ?? versions.find((v) => v.status === "published") ?? null;
    if (showing) {
      const { data: fieldRows } = await supabase
        .from("vertical_fields")
        .select(
          `id, field_key, label, field_type, required, phase, is_pii,
           consent_classification, enum_values, sort_order`,
        )
        .eq("schema_version_id", showing.id)
        .order("sort_order");
      fields = (fieldRows ?? []) as FieldRow[];
    }
  }

  const showing = draft ?? versions.find((v) => v.status === "published") ?? null;
  const editable = showing?.status === "draft";

  return (
    <WorkspaceShell
      role="admin"
      orgName="Qentrax"
      initials="QX"
      active="verticals"
      eyebrow="NETWORK SCHEMA"
      title="Verticals"
      subtitle="Define the canonical fields each vertical's leads are validated against."
    >
      {params.error && <div className="formError">{params.error}</div>}

      <div className="dashGrid">
        <article className="dashPanel">
          <header>
            <span>VERTICALS</span>
            <h2>Catalog</h2>
          </header>
          {(verticals ?? []).map((v) => (
            <Link
              key={v.id}
              href={`/workspace/admin/verticals?vertical=${v.id}`}
              className={v.id === selectedId ? "tableRow vertRow active" : "tableRow vertRow"}
            >
              <span>{v.name}</span>
              <span className="status">{v.code}</span>
              <span className="status">{v.active ? "ACTIVE" : "INACTIVE"}</span>
            </Link>
          ))}
          {!verticals?.length && (
            <div className="tableRow">
              <span className="status">No verticals yet.</span>
            </div>
          )}

          <form action={createVertical} className="stackForm">
            <h3>New vertical</h3>
            <label>
              Code
              <input name="code" required placeholder="solar" />
            </label>
            <label>
              Name
              <input name="name" required placeholder="Solar" />
            </label>
            <label>
              Description
              <textarea name="description" rows={2} />
            </label>
            <button type="submit">CREATE VERTICAL</button>
          </form>
        </article>

        <article className="dashPanel">
          <header>
            <span>SCHEMA VERSIONS</span>
            <h2>{selected ? selected.name : "Select a vertical"}</h2>
          </header>

          {selected && (
            <>
              <form action={updateVertical} className="stackForm">
                <input type="hidden" name="vertical_id" value={selected.id} />
                <label>
                  Name
                  <input name="name" defaultValue={selected.name} required />
                </label>
                <label>
                  Description
                  <textarea name="description" rows={2} defaultValue={selected.description ?? ""} />
                </label>
                <label className="inlineCheck">
                  <input type="checkbox" name="active" defaultChecked={selected.active} />
                  Active
                </label>
                <button type="submit">SAVE METADATA</button>
              </form>

              <div className="tableHead report">
                <span>VERSION</span>
                <span>STATUS</span>
                <span>PUBLISHED</span>
                <span>NOTES</span>
              </div>
              {versions.map((v) => (
                <div className="tableRow report" key={v.id}>
                  <span>v{v.version}</span>
                  <span className="status">{v.status.toUpperCase()}</span>
                  <span>{v.published_at ? v.published_at.slice(0, 10) : "—"}</span>
                  <span>{v.notes ?? "—"}</span>
                </div>
              ))}
              {!versions.length && (
                <div className="tableRow">
                  <span className="status">No schema versions yet.</span>
                </div>
              )}

              {!draft && (
                <form action={createSchemaDraft} className="stackForm">
                  <input type="hidden" name="vertical_id" value={selected.id} />
                  <label>
                    Draft notes
                    <input name="notes" placeholder="What is changing in this version" />
                  </label>
                  <button type="submit">
                    {versions.length ? "OPEN NEW DRAFT" : "CREATE FIRST DRAFT"}
                  </button>
                </form>
              )}

              {draft && (
                <form action={publishSchemaVersion} className="stackForm">
                  <input type="hidden" name="vertical_id" value={selected.id} />
                  <input type="hidden" name="schema_version_id" value={draft.id} />
                  <p className="hint">
                    Publishing freezes v{draft.version}. Editing published semantics
                    requires a new draft.
                  </p>
                  <button type="submit" disabled={fields.length === 0}>
                    PUBLISH v{draft.version}
                  </button>
                </form>
              )}
            </>
          )}
        </article>
      </div>

      {selected && showing && (
        <article className="dashPanel">
          <header>
            <span>FIELDS</span>
            <h2>
              v{showing.version} · {showing.status.toUpperCase()}
              {!editable && " (read-only)"}
            </h2>
          </header>

          <div className="tableHead fieldRow">
            <span>KEY</span>
            <span>LABEL</span>
            <span>TYPE</span>
            <span>REQ</span>
            <span>PHASE</span>
            <span>PII</span>
            <span>CONSENT</span>
            <span>VALUES</span>
            <span>ORDER</span>
          </div>
          {fields.map((f) => (
            <div className="tableRow fieldRow" key={f.id}>
              <span>
                <code>{f.field_key}</code>
              </span>
              <span>{f.label}</span>
              <span className="status">{f.field_type}</span>
              <span>{f.required ? "YES" : "—"}</span>
              <span className="status">{f.phase}</span>
              <span>{f.is_pii ? "PII" : "—"}</span>
              <span className="status">{f.consent_classification}</span>
              <span>{(f.enum_values ?? []).join(", ") || "—"}</span>
              <span className="fieldActions">
                {f.sort_order}
                {editable && (
                  <>
                    <form action={reorderField}>
                      <input type="hidden" name="vertical_id" value={selected.id} />
                      <input type="hidden" name="field_id" value={f.id} />
                      <input type="hidden" name="sort_order" value={f.sort_order} />
                      <input type="hidden" name="direction" value="up" />
                      <button type="submit" aria-label={`Move ${f.field_key} up`}>↑</button>
                    </form>
                    <form action={reorderField}>
                      <input type="hidden" name="vertical_id" value={selected.id} />
                      <input type="hidden" name="field_id" value={f.id} />
                      <input type="hidden" name="sort_order" value={f.sort_order} />
                      <input type="hidden" name="direction" value="down" />
                      <button type="submit" aria-label={`Move ${f.field_key} down`}>↓</button>
                    </form>
                    <form action={deleteField}>
                      <input type="hidden" name="vertical_id" value={selected.id} />
                      <input type="hidden" name="field_id" value={f.id} />
                      <button type="submit" aria-label={`Remove ${f.field_key}`}>✕</button>
                    </form>
                  </>
                )}
              </span>
            </div>
          ))}
          {!fields.length && (
            <div className="tableRow">
              <span className="status">No fields on this version yet.</span>
            </div>
          )}

          {editable && (
            <form action={addField} className="stackForm fieldBuilder">
              <h3>Add field</h3>
              <input type="hidden" name="vertical_id" value={selected.id} />
              <input type="hidden" name="schema_version_id" value={showing.id} />
              <div className="formGrid">
                <label>
                  Key
                  <input name="field_key" required placeholder="monthly_bill" />
                </label>
                <label>
                  Label
                  <input name="label" required placeholder="Monthly bill" />
                </label>
                <label>
                  Type
                  <select name="field_type" defaultValue="text">
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Phase
                  <select name="phase" defaultValue="post">
                    {FIELD_PHASES.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Consent
                  <select name="consent_classification" defaultValue="none">
                    {CONSENT_CLASSES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Order
                  <input name="sort_order" type="number" defaultValue={fields.length + 1} />
                </label>
                <label className="wide">
                  Description
                  <input name="description" />
                </label>
                <label className="wide">
                  Allowed values (enum only, comma separated)
                  <input name="enum_values" placeholder="shingle, tile, metal" />
                </label>
                <label className="wide">
                  Aliases (comma separated)
                  <input name="aliases" placeholder="phone_number, tel" />
                </label>
                <label>
                  Min
                  <input name="min" type="number" step="any" />
                </label>
                <label>
                  Max
                  <input name="max" type="number" step="any" />
                </label>
                <label>
                  Min length
                  <input name="min_length" type="number" />
                </label>
                <label>
                  Max length
                  <input name="max_length" type="number" />
                </label>
                <label className="wide">
                  Pattern
                  <input name="pattern" placeholder="^9\d{4}$" />
                </label>
                <label className="inlineCheck">
                  <input type="checkbox" name="required" />
                  Required
                </label>
                <label className="inlineCheck">
                  <input type="checkbox" name="is_pii" />
                  Contains PII
                </label>
              </div>
              <button type="submit">ADD FIELD</button>
            </form>
          )}
        </article>
      )}
    </WorkspaceShell>
  );
}
