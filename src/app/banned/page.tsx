import { PageHeader } from '@/components/ui';

export default function BannedPage() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-16 pb-safe">
      <PageHeader
        title="Account suspended"
        subtitle="This account can no longer buy or sell on ReWyse."
      />
      <p className="mt-4 text-sm text-[var(--muted)]">
        If you think this is a mistake, email the ReWyse team from your college address.
      </p>
    </main>
  );
}
