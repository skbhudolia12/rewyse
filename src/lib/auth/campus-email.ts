/**
 * Campus email matching -- signup gate A.
 *
 * Pure functions, no I/O: the caller supplies the allow-list from the database.
 * This is a security boundary, so it is deliberately strict and allow-list only.
 * Every relaxation here widens who can reach the pilot.
 */

export interface CampusDomain {
  campus_id: string;
  domain: string;
}

/**
 * Lowercases and trims. Does NOT strip Gmail-style dots or +tags: those are
 * Gmail conventions, and applying them to a university mail system could
 * collapse two genuinely different students onto one identity.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The part after the final "@", or null if this is not shaped like an email. */
export function extractDomain(email: string): string | null {
  const normalized = normalizeEmail(email);

  // One "@" exactly, something before it, something after it, and a dot in the
  // domain. Deliberately not RFC 5322 -- a permissive regex here is a hole, and
  // the real proof of ownership is the code we mail to the address anyway.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;

  const at = normalized.lastIndexOf('@');
  const domain = normalized.slice(at + 1);
  return domain.length > 0 ? domain : null;
}

/**
 * Resolves an email to its campus, or null when the domain is not allow-listed.
 *
 * Matches the full domain only. A subdomain such as `cse.iiitd.ac.in` does not
 * match `iiitd.ac.in` unless it is listed in its own right -- suffix matching
 * would let `notiiitd.ac.in` through on a careless implementation, and the cost
 * of an explicit extra row is one insert.
 */
export function resolveCampusForEmail(
  email: string,
  allowList: readonly CampusDomain[],
): string | null {
  const domain = extractDomain(email);
  if (!domain) return null;
  const match = allowList.find((entry) => entry.domain.trim().toLowerCase() === domain);
  return match ? match.campus_id : null;
}

export function isAllowedCampusEmail(
  email: string,
  allowList: readonly CampusDomain[],
): boolean {
  return resolveCampusForEmail(email, allowList) !== null;
}

/** Human-readable list for the "use your college email" hint. */
export function describeAllowedDomains(allowList: readonly CampusDomain[]): string {
  const unique = [...new Set(allowList.map((d) => `@${d.domain}`))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0]!;
  return `${unique.slice(0, -1).join(', ')} or ${unique.at(-1)}`;
}
