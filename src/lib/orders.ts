/**
 * The order journey as the buyer and seller see it.
 *
 * Derived purely from the payment row, so the tracker on the order page, the
 * status chip in the orders list and the admin console cannot disagree about
 * where an order is.
 */

export interface PaymentRow {
  status: string;
  delivery_status: string | null;
  scheduled_at: string | null;
  picked_up_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  buyer_confirmed_at: string | null;
  released_at: string | null;
  refunded_at: string | null;
}

export interface OrderStep {
  key: string;
  label: string;
  at: string | null;
}

export function orderSteps(p: PaymentRow): OrderStep[] {
  return [
    { key: 'paid', label: 'Paid, held in ReWyse Escrow', at: p.scheduled_at },
    { key: 'picked_up', label: 'Picked up from the seller', at: p.picked_up_at },
    { key: 'out_for_delivery', label: 'Out for delivery', at: p.out_for_delivery_at },
    { key: 'delivered', label: 'Delivered', at: p.delivered_at },
    { key: 'confirmed', label: 'Buyer confirmed the item', at: p.buyer_confirmed_at },
    { key: 'paid_out', label: 'Seller paid', at: p.released_at },
  ];
}

export type OrderStage =
  | 'awaiting_payment'
  | 'scheduled'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'confirmed'
  | 'completed'
  | 'refunded'
  | 'cancelled';

export function orderStage(p: PaymentRow): OrderStage {
  if (p.status === 'released') return 'completed';
  if (p.status === 'refunded') return 'refunded';
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'initiated') return 'awaiting_payment';
  if (p.buyer_confirmed_at) return 'confirmed';
  return (p.delivery_status as OrderStage | null) ?? 'scheduled';
}

export const STAGE_LABELS: Record<OrderStage, string> = {
  awaiting_payment: 'Awaiting payment',
  scheduled: 'Pickup scheduled',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  confirmed: 'Awaiting payout',
  completed: 'Completed',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

/** "10 Nov, 3:42 pm" in Delhi time, whatever the server's clock zone. */
export function formatOrderTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}
