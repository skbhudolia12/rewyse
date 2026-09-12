import { requireProfile } from '@/lib/auth/session';
import { BottomNav } from '@/components/bottom-nav';

/**
 * Shell for signed-in students.
 *
 * The nav only appears once both gates are cleared. Showing Sell and Messages
 * to someone who cannot use them would invite a tap that ends in a redirect,
 * which reads as the app being broken rather than the account being pending.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const profile = await requireProfile();
  const verified = profile.verified_status === 'verified';

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className={verified ? 'flex-1 pb-nav' : 'flex-1'}>{children}</div>
      {verified && <BottomNav isAdmin={profile.role === 'admin'} />}
    </div>
  );
}
