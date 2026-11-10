import { requireAdmin } from '@/lib/auth/session';
import { SiteHeader } from '@/components/site-header';
import { isDemoEmail } from '@/lib/demo';
import { AdminNav } from './admin-nav';

/** Operations console shell: the marketplace header, plus the console's own sections. */
export default async function AdminLayout({ children }: LayoutProps<'/'>) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <SiteHeader
        firstName={admin.full_name.split(' ')[0] ?? 'Admin'}
        campusAbbr={admin.campus?.abbreviation ?? 'Delhi'}
        isAdmin
        verified={admin.verified_status === 'verified'}
        isDemo={isDemoEmail(admin.email)}
      />
      <AdminNav />
      <div className="flex-1 pb-12">{children}</div>
    </div>
  );
}
