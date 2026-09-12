import { describe, expect, it } from 'vitest';
import {
  describeAllowedDomains,
  extractDomain,
  isAllowedCampusEmail,
  normalizeEmail,
  resolveCampusForEmail,
  type CampusDomain,
} from './campus-email';

const ALLOW: CampusDomain[] = [
  { campus_id: 'iiitd', domain: 'iiitd.ac.in' },
  { campus_id: 'iitd', domain: 'iitd.ac.in' },
  { campus_id: 'dtu', domain: 'dtu.ac.in' },
];

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Sarthak@IIITD.ac.in ')).toBe('sarthak@iiitd.ac.in');
  });

  it('preserves dots and plus tags, which are not universal conventions', () => {
    expect(normalizeEmail('a.b+tag@iiitd.ac.in')).toBe('a.b+tag@iiitd.ac.in');
  });
});

describe('extractDomain', () => {
  it('returns the domain', () => {
    expect(extractDomain('sarthak22@iiitd.ac.in')).toBe('iiitd.ac.in');
  });

  it.each([
    ['no at sign', 'sarthakiiitd.ac.in'],
    ['no domain dot', 'sarthak@localhost'],
    ['empty local part', '@iiitd.ac.in'],
    ['empty domain', 'sarthak@'],
    ['whitespace inside', 'sar thak@iiitd.ac.in'],
    ['two at signs', 'a@b@iiitd.ac.in'],
    ['empty string', ''],
  ])('rejects %s', (_label, input) => {
    expect(extractDomain(input)).toBeNull();
  });
});

describe('resolveCampusForEmail', () => {
  it('maps a valid campus email to its campus', () => {
    expect(resolveCampusForEmail('sarthak@iiitd.ac.in', ALLOW)).toBe('iiitd');
    expect(resolveCampusForEmail('someone@dtu.ac.in', ALLOW)).toBe('dtu');
  });

  it('is case-insensitive on the domain', () => {
    expect(resolveCampusForEmail('Sarthak@IIITD.AC.IN', ALLOW)).toBe('iiitd');
  });

  it('rejects a personal email', () => {
    expect(resolveCampusForEmail('someone@gmail.com', ALLOW)).toBeNull();
  });

  /**
   * The important cases. Each of these passes a naive `endsWith` check and would
   * let an outsider into a pilot whose entire trust model is "everyone here is a
   * verified student on your campus".
   */
  it('rejects a lookalike domain that merely ends with an allowed one', () => {
    expect(resolveCampusForEmail('attacker@notiiitd.ac.in', ALLOW)).toBeNull();
    expect(resolveCampusForEmail('attacker@fake-iitd.ac.in', ALLOW)).toBeNull();
  });

  it('rejects a subdomain that is not itself allow-listed', () => {
    expect(resolveCampusForEmail('student@cse.iiitd.ac.in', ALLOW)).toBeNull();
  });

  it('rejects an allowed domain smuggled into the local part', () => {
    expect(resolveCampusForEmail('iiitd.ac.in@gmail.com', ALLOW)).toBeNull();
  });

  it('rejects an allowed domain used as a prefix', () => {
    expect(resolveCampusForEmail('a@iiitd.ac.in.evil.com', ALLOW)).toBeNull();
  });

  it('returns null against an empty allow-list rather than defaulting open', () => {
    expect(resolveCampusForEmail('sarthak@iiitd.ac.in', [])).toBeNull();
  });
});

describe('isAllowedCampusEmail', () => {
  it('agrees with resolveCampusForEmail', () => {
    expect(isAllowedCampusEmail('sarthak@iitd.ac.in', ALLOW)).toBe(true);
    expect(isAllowedCampusEmail('sarthak@gmail.com', ALLOW)).toBe(false);
  });
});

describe('describeAllowedDomains', () => {
  it('renders a readable list for the signup hint', () => {
    expect(describeAllowedDomains(ALLOW)).toBe('@iiitd.ac.in, @iitd.ac.in or @dtu.ac.in');
  });

  it('handles a single domain without a dangling conjunction', () => {
    expect(describeAllowedDomains([ALLOW[0]!])).toBe('@iiitd.ac.in');
  });

  it('handles an empty allow-list', () => {
    expect(describeAllowedDomains([])).toBe('');
  });
});
