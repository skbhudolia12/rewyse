import { requireProfile } from '@/lib/auth/session';
import { BottomNav } from '@/components/bottom-nav';

/**
 * Shell for signed-in students.
 *
 * The student nav only appears once both gates are cleared: showing Sell and
 * Messages to someone who cannot use them invites a tap that ends in a
 * redirect, which reads as the app being broken rather than the account being
 * pending.
 *
 * Admins are the exception, and it is not cosmetic. An admin who is not yet
 * verified needs the console to reach the queue that would verify them -- and
 * hiding the nav from them leaves the first person to set up a campus with no
 * route in at all. That happened.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const profile = await requireProfile();
  const verified = profile.verified_status === 'verified';
  const isAdmin = profile.role === 'admin';
  const showNav = verified || isAdmin;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className={showNav ? 'flex-1 pb-nav' : 'flex-1'}>{children}</div>
      {showNav && <BottomNav isAdmin={isAdmin} verified={verified} />}
    </div>
  );
}
