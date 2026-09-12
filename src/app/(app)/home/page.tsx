import { Badge, Card, PageHeader } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';

/**
 * Placeholder feed. The real browse experience lands in Phase 3; this exists so
 * the verified state has somewhere to arrive and the gating is demonstrable end
 * to end.
 */
export default async function HomePage() {
  const profile = await requireVerified();

  return (
    <main className="mx-auto w-full max-w-md space-y-6 px-5 py-8">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={`Hi, ${profile.full_name.split(' ')[0]}`} subtitle="You are verified." />
        <Badge tone="verify">Verified · {profile.campus?.abbreviation}</Badge>
      </div>

      <Card className="space-y-2">
        <p className="font-medium">The feed lands in Phase 3.</p>
        <p className="text-sm text-paper-dim">
          Listings, move-out clearance and cluster browsing are next. Your account is fully
          verified, so nothing here is blocked on you.
        </p>
      </Card>
    </main>
  );
}
