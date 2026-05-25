import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "client" | "contractor" | "admin";

export type JobStatus = "pending" | "matched" | "in_progress" | "completed" | "cancelled";
export type PaymentStatus = "pending" | "processing" | "paid";

export interface Profile {
  id: string;
  role: UserRole;
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  created_at: string;
}

export interface Contractor {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  specialties: string[];
  years_of_experience: number;
  service_area: string[];
  availability: Record<string, string[]>;
  photo_url: string | null;
  is_approved: boolean;
  rating: number;
  total_jobs: number;
  total_earnings: number;
  created_at: string;
}

export interface Job {
  id: string;
  client_id: string;
  contractor_id: string | null;
  service_needed: string;
  location: string;
  preferred_schedule: string;
  job_description: string;
  status: JobStatus;
  quoted_price: number | null;
  final_price: number | null;
  scheduled_date: string | null;
  completed_at: string | null;
  created_at: string;
  // joined
  clients?: Client;
  contractors?: Contractor;
}

export interface Message {
  id: string;
  job_id: string;
  sender_id: string;
  sender_role: UserRole;
  content: string;
  created_at: string;
}

export interface Earning {
  id: string;
  contractor_id: string;
  job_id: string;
  amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
  jobs?: Job;
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}
