import { createClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/ensure-user";

export type AuthContext = {
  authSubject: string;
  email: string;
  userId: string;
};

export async function requireAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;

  const user = await ensureUser(supabase, data.claims as {
    sub?: string;
    email?: string;
    user_metadata?: { display_name?: string };
  });
  if (!user) return null;

  return {
    authSubject: data.claims.sub,
    email: String(data.claims.email ?? ""),
    userId: user.id,
  };
}
