/**
 * Public demo access: one link (/demo) that signs a visitor in as a seeded
 * demo account, so a reviewer can try every side of the marketplace without a
 * college inbox.
 *
 * SECURITY: this is a sign-in without proof of identity, scoped to exactly the
 * three seeded accounts below and nothing a visitor can name. One of them is an
 * admin. Set DEMO_ACCESS=off in the deployment to close it.
 */

export const DEMO_ROLES = {
  seller: {
    email: 'demo.seller@iiitd.ac.in',
    label: 'Seller',
    person: 'Rohit Mehra',
    context: 'IIITD, moving out in 5 days',
    does: 'List an item and watch the AI price it, then boost the listing.',
    landing: '/profile',
  },
  buyer: {
    email: 'demo.buyer@iitd.ac.in',
    label: 'Buyer',
    person: 'Ananya Rao',
    context: 'IITD',
    does: 'Browse, make an offer, pay into escrow and track the delivery.',
    landing: '/home',
  },
  ops: {
    email: 'demo.ops@iiitd.ac.in',
    label: 'Operations',
    person: 'Kabir Sethi',
    context: 'Dobara team',
    does: 'Move deliveries along, release payouts and see the revenue.',
    landing: '/admin',
  },
} as const;

export type DemoRole = keyof typeof DEMO_ROLES;

export const DEMO_ROLE_KEYS = Object.keys(DEMO_ROLES) as DemoRole[];

export function demoAccessEnabled(): boolean {
  return process.env.DEMO_ACCESS !== 'off';
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return DEMO_ROLE_KEYS.some((role) => DEMO_ROLES[role].email === email);
}
