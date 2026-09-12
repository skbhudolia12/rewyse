import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { describeAllowedDomains, type CampusDomain } from './campus-email';

/**
 * The allow-listed campus domains, formatted for the signup hint.
 *
 * Read with the admin client so the hint renders for visitors with no session.
 * The list is not secret -- it is the set of colleges the pilot is open to.
 */
export async function getAllowedDomains(): Promise<CampusDomain[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('campus_domains').select('campus_id, domain');
  return (data ?? []) as CampusDomain[];
}

export async function getAllowedDomainHint(): Promise<string> {
  return describeAllowedDomains(await getAllowedDomains());
}
