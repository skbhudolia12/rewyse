import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/domain';

/**
 * Server-side session and gating helpers.
 *
 * These are convenience guards for rendering, NOT the security boundary -- RLS
 * is. Every one of these has a matching policy in 0003_rls.sql, so a client that
 * skips the UI entirely still cannot read or write what it should not. Keep it
 * that way: never add a guard here without the policy behind it.
 */

export interface ProfileWithCampus extends Profile {
  campus: {
    id: string;
    name: string;
    abbreviation: string;
    cluster_id: string;
  } | null;
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The signed-in user's profile, or null if they have not completed signup. */
export async function getProfile(): Promise<ProfileWithCampus | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*, campus:campuses(id, name, abbreviation, cluster_id)')
    .eq('id', user.id)
    .maybeSingle();

  return (data as ProfileWithCampus | null) ?? null;
}

/** Signed in, but says nothing about verification. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Signed in AND has finished the signup form. An authenticated user without a
 * profile row is mid-signup: they confirmed their email but never submitted
 * their details, so send them back to finish rather than showing an empty app.
 */
export async function requireProfile(): Promise<ProfileWithCampus> {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile) redirect('/signup/details');
  if (profile.banned_at) redirect('/banned');
  void user;
  return profile;
}

/**
 * Both gates cleared. This is the guard for anything that touches other
 * students: listing, messaging, offering.
 */
export async function requireVerified(): Promise<ProfileWithCampus> {
  const profile = await requireProfile();
  if (profile.verified_status !== 'verified') redirect('/verify');
  return profile;
}

export async function requireAdmin(): Promise<ProfileWithCampus> {
  const profile = await requireProfile();
  // Not found rather than forbidden: an admin console whose existence is
  // confirmed to every logged-in student is an invitation to go looking.
  if (profile.role !== 'admin') redirect('/home');
  return profile;
}
