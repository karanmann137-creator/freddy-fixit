import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// getProfile() was removed: nothing called it, and it used `.single()`, which
// errors on zero rows — exactly what half-finished (orphaned) accounts hit. Every
// live profile lookup uses `.maybeSingle()` plus the `ensure_profile` self-repair.

// signOut() was removed too (2026-11-09): zero importers, and it was a TRAP
// rather than dead weight. It called `signOut()` with no options, i.e. the
// default GLOBAL scope, which revokes every refresh token for the user on
// every device — while the one real sign-out in the app (TopNav) deliberately
// passes `{ scope: "local" }`. Anyone who reached for the obviously-named
// helper would have silently signed the user out of their phone as well.
// Sign out through TopNav's handler, and call clearMyProfile() alongside it.

export interface Profile {
  id: string; email: string; first_name: string; last_name: string; phone: string; role: string; created_at: string;
}
export interface ClientRequest {
  id: string; user_id: string; first_name: string; last_name: string; email: string; phone: string;
  service_needed: string; preferred_schedule: string; location: string; job_description: string;
  status: string; assigned_contractor_id: string | null; created_at: string;
}
export interface Contractor {
  id: string; specialties: string[]; years_of_experience: number; service_area: string[];
  availability: Record<string, string[]>; photo_url: string | null; rating: number;
  total_jobs: number; total_earned: number; status: string; created_at: string;
}
export interface Job {
  id: string; request_id: string; contractor_id: string; client_id: string;
  status: string; scheduled_date: string | null; amount: number | null; notes: string | null; created_at: string;
}
export interface Message {
  id: string; job_id: string; sender_id: string; content: string; created_at: string;
}

// Roles used across role-gated routes/dashboards.
export type UserRole = "client" | "contractor" | "admin";
