import Link from "next/link";
import { redirect } from "next/navigation";
import { createOrganization } from "./actions";
import { requireAuthContext } from "@/lib/auth-context";

const ERRORS: Record<string, string> = {
  invalid: "Check account type and legal name.",
  create: "Could not create organization. Sign out/in once, then try again.",
  role: "Owner role is missing from the database seed.",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const auth = await requireAuthContext();
  if (!auth) redirect("/sign-in");
  const state = await searchParams;

  return (
    <main>
      <nav>
        <Link className="brand" href="/">
          QENTRAX
        </Link>
        <span className="pill">Onboarding</span>
      </nav>
      <section className="workspace narrow">
        <p className="eyebrow">CREATE ORGANIZATION</p>
        <h1>Register your company</h1>
        <p className="lede">
          Signed in as {auth.email}. Choose advertiser or publisher, then complete
          company identity. KYB review and funding come after approval.
        </p>
        <form action={createOrganization}>
          <label>
            Account type
            <select name="type" required defaultValue="advertiser">
              <option value="advertiser">Advertiser — buy verified demand</option>
              <option value="publisher">Publisher — monetize opportunities</option>
            </select>
          </label>
          <label>
            Legal name
            <input name="legal_name" required placeholder="Acme Insurance LLC" />
          </label>
          <label>
            DBA (optional)
            <input name="dba_name" placeholder="Acme" />
          </label>
          <label>
            Website
            <input name="website" type="url" placeholder="https://example.com" />
          </label>
          <label>
            Tax country
            <input name="tax_country" defaultValue="US" maxLength={2} />
          </label>
          <button className="button" type="submit">
            Create organization
          </button>
        </form>
        {state.error && (
          <p className="notice" role="alert">
            {ERRORS[state.error] ?? "Could not create organization. Try again."}
          </p>
        )}
        <p className="lede">
          <Link href="/workspace">Back to workspace</Link>
        </p>
      </section>
    </main>
  );
}
