import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireVerified } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { THREAD_LIST_SELECT } from '@/lib/messaging/queries';
import { formatINR } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface ThreadRow {
  id: string;
  status: string;
  updated_at: string;
  buyer_id: string;
  seller_id: string;
  listing: { id: string; title: string; asking_price: number; status: string } | null;
  buyer: { id: string; full_name: string } | null;
  seller: { id: string; full_name: string } | null;
  messages: Array<{ id: string; body: string; created_at: string; sender_id: string; read_at: string | null }> | null;
}

export default async function MessagesPage() {
  const me = await requireVerified();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conversations')
    .select(THREAD_LIST_SELECT)
    .order('updated_at', { ascending: false });

  const threads = (data ?? []) as unknown as ThreadRow[];

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
      <PageHeader title="Messages" subtitle="Every conversation about an item you're buying or selling." />

      {error && (
        <Card>
          <p className="text-danger text-sm">Could not load your messages: {error.message}</p>
        </Card>
      )}

      {threads.length === 0 && !error ? (
        <Card className="py-12 text-center">
          <MessageCircle className="text-paper-faint mx-auto size-8" />
          <p className="font-display mt-4 text-xl">No conversations yet</p>
          <p className="text-paper-dim mx-auto mt-2 max-w-xs text-sm leading-relaxed">
            When you message a seller or someone asks about your listing, it shows up here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {threads.map((t) => {
            const isBuyer = t.buyer_id === me.id;
            const other = isBuyer ? t.seller : t.buyer;
            const sorted = (t.messages ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
            const last = sorted[0];
            const unread = (t.messages ?? []).filter((m) => m.sender_id !== me.id && !m.read_at).length;

            return (
              <Link key={t.id} href={`/messages/${t.id}`} className="block">
                <Card className="hover:border-flame-edge transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{other?.full_name ?? 'Unknown'}</span>
                        <span className="text-paper-faint shrink-0 text-[11px]">
                          {isBuyer ? 'seller' : 'buyer'}
                        </span>
                        {unread > 0 && <Badge tone="flame" className="shrink-0 px-2 py-0.5 text-[10px]">{unread}</Badge>}
                      </div>
                      <p className="text-paper-dim mt-1 truncate text-[13px]">{t.listing?.title}</p>
                      {last && (
                        <p className="text-paper-faint mt-2 truncate text-[13px]">
                          {last.sender_id === me.id ? 'You: ' : ''}
                          {last.body}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg">{formatINR(t.listing?.asking_price ?? 0)}</p>
                      {t.status !== 'open' && (
                        <p className="text-paper-dim mt-1 text-[11px] capitalize">{t.status.replace('_', ' ')}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
