"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/sign-in?error=invalid_email");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm` } });
  redirect(error ? "/sign-in?error=delivery_failed" : "/sign-in?sent=1");
}
