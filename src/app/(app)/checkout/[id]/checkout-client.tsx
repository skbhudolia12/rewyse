'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { formatINR } from '@/lib/utils';
import { XPaySheet } from '@/components/xpay-sheet';
import { capturePayment } from '@/lib/payments/actions';

export interface CheckoutOrder {
  id: string;
  reference: string;
  itemAmount: number;
  convenienceFee: number;
  deliveryFee: number;
  total: number;
}

interface Props {
  order: CheckoutOrder;
  item: { listingId: string; title: string; imageUrl: string | null; sellerName: string; fromCampus: string };
  buyer: { name: string; email: string; hostel: string; campus: string };
  eta: string;
}

export function CheckoutClient({ order, item, buyer, eta }: Props) {
  const [hostel, setHostel] = useState(buyer.hostel);
  const [room, setRoom] = useState('');
  const [touched, setTouched] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const router = useRouter();

  const addressOk = hostel.trim().length >= 2 && room.trim().length >= 1;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Step n={1} title="Delivery address">
            <p className="text-paper-dim text-sm">
              {buyer.name}, {buyer.campus}
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_10rem]">
              <Field
                label="Hostel or block"
                htmlFor="hostel"
                error={touched && hostel.trim().length < 2 ? 'Add your hostel or block.' : undefined}
              >
                <Input
                  id="hostel"
                  value={hostel}
                  onChange={(e) => setHostel(e.target.value)}
                  placeholder="Boys Hostel, Block C"
                  autoComplete="address-line1"
                />
              </Field>
              <Field
                label="Room"
                htmlFor="room"
                error={touched && room.trim().length < 1 ? 'Add your room number.' : undefined}
              >
                <Input
                  id="room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="214"
                  autoComplete="address-line2"
                />
              </Field>
            </div>
          </Step>

          <Step n={2} title="Review your item">
            <div className="flex gap-4">
              <div className="bg-ink-elevated size-20 shrink-0 overflow-hidden rounded-lg">
                {item.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={item.imageUrl} alt="" className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <Link
                  href={`/listing/${item.listingId}`}
                  className="hover:text-flame-bright line-clamp-2 font-medium"
                >
                  {item.title}
                </Link>
                <p className="text-paper-dim text-sm">
                  Sold by {item.sellerName}, {item.fromCampus}
                </p>
                <p className="text-sm">{formatINR(order.itemAmount)}</p>
              </div>
            </div>
            <p className="border-hairline text-paper-dim mt-4 flex items-center gap-2 border-t pt-4 text-sm">
              <Truck className="size-4 shrink-0" />
              Delivered by SwiftDrop Logistics by{' '}
              <span className="text-paper font-medium">{eta}</span>
            </p>
          </Step>

          <Step n={3} title="Payment">
            <p className="text-paper-dim text-sm">
              Pay securely with X-Pay using UPI, a card or netbanking.
            </p>
          </Step>
        </div>

        <aside className="lg:sticky lg:top-32 lg:h-fit">
          <div className="border-hairline-strong bg-ink-raised space-y-4 rounded-xl border p-5">
            <h2 className="font-semibold">Order summary</h2>
            <dl className="space-y-2 text-sm">
              <SummaryRow label="Item" value={formatINR(order.itemAmount)} />
              <SummaryRow label="Delivery" value={formatINR(order.deliveryFee)} />
              <SummaryRow label="Convenience fee" value={formatINR(order.convenienceFee)} />
              <div className="border-hairline flex justify-between border-t pt-3 text-base font-semibold">
                <dt>Order total</dt>
                <dd>{formatINR(order.total)}</dd>
              </div>
            </dl>

            {touched && !addressOk && (
              <Alert tone="error">Add your hostel and room so the rider can find you.</Alert>
            )}

            <Button
              variant="flame"
              size="lg"
              className="w-full"
              onClick={() => {
                setTouched(true);
                if (addressOk) setSheetOpen(true);
              }}
            >
              Pay {formatINR(order.total)}
            </Button>

            <div className="border-hairline space-y-3 border-t pt-4 text-[13px]">
              <p className="flex gap-2.5">
                <ShieldCheck className="text-verify size-4 shrink-0" />
                <span className="text-paper-dim">
                  Held in Dobara Escrow. {item.sellerName.split(' ')[0]} is paid only after you
                  confirm the item arrived as described.
                </span>
              </p>
              <p className="flex gap-2.5">
                <RotateCcw className="text-paper-dim size-4 shrink-0" />
                <span className="text-paper-dim">Not as described? Report it and get a full refund.</span>
              </p>
            </div>
          </div>
        </aside>
      </div>

      {sheetOpen && (
        <XPaySheet
          reference={order.reference}
          amount={order.total}
          payer={{ name: buyer.name, email: buyer.email }}
          onPay={async (method) => {
            const result = await capturePayment({
              paymentId: order.id,
              hostel: hostel.trim(),
              room: room.trim(),
              method,
            });
            return result.ok ? { ok: true } : result;
          }}
          onSuccess={() => router.push(`/orders/${order.id}?paid=1`)}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-hairline bg-ink-raised rounded-xl border p-5">
      <h2 className="mb-3 flex items-center gap-3 font-semibold">
        <span className="border-hairline-strong text-paper-dim flex size-7 items-center justify-center rounded-full border text-[13px]">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-paper-dim">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
