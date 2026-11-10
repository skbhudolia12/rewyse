'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, CreditCard, Loader2, Lock, QrCode, X } from 'lucide-react';
import { cn, formatINR } from '@/lib/utils';

/**
 * X-Pay: a stand-in payment gateway.
 *
 * Styled as a separate company's product -- light, its own blue -- because a
 * real gateway is one, and the handover from Dobara to the gateway and back is
 * part of what the demo shows. No card or UPI detail entered here goes
 * anywhere; the caller's onPay records only which method was used.
 */

export type PaymentMethod = 'upi' | 'card' | 'netbanking';
export type PayResult = { ok: true } | { ok: false; error: string };
type Stage = 'choose' | 'processing' | 'success' | 'failed';

/** Long enough to read the processing state, short enough not to drag on camera. */
const PROCESSING_MS = 2200;
const SUCCESS_HOLD_MS = 1600;

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Yes Bank'];

const METHODS: Array<{ id: PaymentMethod; label: string; hint: string; icon: typeof QrCode }> = [
  { id: 'upi', label: 'UPI', hint: 'Any UPI app', icon: QrCode },
  { id: 'card', label: 'Card', hint: 'Visa, Mastercard, RuPay', icon: CreditCard },
  { id: 'netbanking', label: 'Netbanking', hint: 'All major banks', icon: Building2 },
];

export function XPaySheet({
  reference,
  amount,
  payer,
  onPay,
  onSuccess,
  onClose,
}: {
  reference: string;
  amount: number;
  payer: { name: string; email: string };
  /** Records the payment. Runs after the processing animation, so failures show in the sheet. */
  onPay: (method: PaymentMethod) => Promise<PayResult>;
  /** Called after the success screen has been shown. */
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [stage, setStage] = useState<Stage>('choose');
  const [error, setError] = useState<string | null>(null);
  const [bank, setBank] = useState(BANKS[0]!);
  const [vpa, setVpa] = useState(`${payer.name.split(' ')[0]!.toLowerCase()}@okxpay`);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stage === 'choose') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, onClose]);

  async function pay() {
    setError(null);
    setStage('processing');
    await new Promise((r) => setTimeout(r, PROCESSING_MS));
    const result = await onPay(method);
    if (!result.ok) {
      setError(result.error);
      setStage('failed');
      return;
    }
    setStage('success');
    setTimeout(onSuccess, SUCCESS_HOLD_MS);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="X-Pay checkout"
        className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-t-2xl bg-white text-slate-900 shadow-2xl focus:outline-none sm:rounded-2xl md:h-[520px] md:flex-row"
      >
        <div className="flex shrink-0 flex-col justify-between bg-[#14213d] p-5 text-white md:w-60 md:p-6">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-white text-sm font-bold text-[#14213d]">
                  R
                </span>
                <span>
                  <span className="block text-sm font-semibold">Dobara</span>
                  <span className="block text-[11px] text-white/60">Campus marketplace</span>
                </span>
              </div>
              {stage === 'choose' && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cancel payment"
                  className="rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white md:hidden"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-6 text-xs text-white/60">Amount payable</p>
            <p className="text-3xl font-semibold tracking-tight">{formatINR(amount)}</p>
            <p className="mt-3 text-[11px] break-all text-white/50">Order {reference}</p>
          </div>
          <p className="mt-5 hidden items-center gap-1.5 text-[11px] text-white/60 md:flex">
            <Lock className="size-3" />
            Secured by <span className="font-semibold text-white">X-Pay</span>
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {stage === 'choose' && (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                <p className="text-sm font-semibold">Payment options</p>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cancel payment"
                  className="hidden rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 md:block"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                <ul className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 p-2 sm:w-44 sm:flex-col sm:border-r sm:border-b-0">
                  {METHODS.map(({ id, label, hint, icon: Icon }) => (
                    <li key={id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setMethod(id)}
                        aria-pressed={method === id}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition',
                          method === id ? 'bg-[#eef2ff] text-[#2847d8]' : 'text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span>
                          <span className="block text-sm font-medium">{label}</span>
                          <span className="hidden text-[11px] text-slate-500 sm:block">{hint}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  {method === 'upi' && (
                    <div className="space-y-5">
                      <div className="flex items-center gap-4">
                        <FakeQr seed={reference} />
                        <div className="text-sm">
                          <p className="font-medium">Scan with any UPI app</p>
                          <p className="mt-1 text-[13px] text-slate-500">
                            Open your UPI app, scan the code and approve the payment.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
                      </div>
                      <label className="block">
                        <span className="text-[13px] font-medium text-slate-700">UPI ID</span>
                        <input
                          value={vpa}
                          onChange={(e) => setVpa(e.target.value)}
                          className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900 focus:border-[#2847d8] focus:ring-2 focus:ring-[#2847d8]/20 focus:outline-none"
                        />
                      </label>
                    </div>
                  )}

                  {method === 'card' && (
                    <div className="space-y-4">
                      <GatewayInput label="Card number" defaultValue="4111 1111 1111 1111" />
                      <GatewayInput label="Name on card" defaultValue={payer.name} />
                      <div className="grid grid-cols-2 gap-3">
                        <GatewayInput label="Expiry" defaultValue="12 / 28" />
                        <GatewayInput label="CVV" defaultValue="•••" />
                      </div>
                    </div>
                  )}

                  {method === 'netbanking' && (
                    <ul className="grid grid-cols-2 gap-2">
                      {BANKS.map((b) => (
                        <li key={b}>
                          <button
                            type="button"
                            onClick={() => setBank(b)}
                            aria-pressed={bank === b}
                            className={cn(
                              'flex min-h-14 w-full items-center rounded-lg border px-3 text-left text-[13px] transition',
                              bank === b
                                ? 'border-[#2847d8] bg-[#eef2ff] font-medium text-[#2847d8]'
                                : 'border-slate-200 text-slate-700 hover:border-slate-300',
                            )}
                          >
                            {b}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="border-t border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => void pay()}
                  className="h-12 w-full rounded-lg bg-[#2847d8] text-[15px] font-semibold text-white transition hover:bg-[#1f3bbd] focus-visible:ring-2 focus-visible:ring-[#2847d8] focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Pay {formatINR(amount)}
                </button>
                <p className="mt-2.5 text-center text-[11px] text-slate-500">
                  Paying as {payer.email}
                </p>
              </div>
            </>
          )}

          {stage === 'processing' && (
            <CenterState>
              <Loader2 className="size-10 animate-spin text-[#2847d8]" />
              <p className="mt-5 font-semibold">
                {method === 'upi'
                  ? 'Waiting for you to approve in your UPI app'
                  : method === 'card'
                    ? 'Verifying your card'
                    : `Connecting to ${bank}`}
              </p>
              <p className="mt-1.5 text-sm text-slate-500">Don&rsquo;t close or refresh this window.</p>
            </CenterState>
          )}

          {stage === 'success' && (
            <CenterState>
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="size-7" strokeWidth={3} />
              </span>
              <p className="mt-5 text-lg font-semibold">Payment successful</p>
              <p className="mt-1 text-sm text-slate-500">
                {formatINR(amount)} paid to Dobara
              </p>
              <p className="mt-6 text-xs text-slate-400">Taking you back to Dobara</p>
            </CenterState>
          )}

          {stage === 'failed' && (
            <CenterState>
              <span className="flex size-14 items-center justify-center rounded-full bg-red-500 text-white">
                <X className="size-7" strokeWidth={3} />
              </span>
              <p className="mt-5 text-lg font-semibold">Payment didn&rsquo;t go through</p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">{error}</p>
              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setStage('choose')}
                  className="h-11 rounded-lg bg-[#2847d8] px-5 text-sm font-semibold text-white hover:bg-[#1f3bbd]"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </CenterState>
          )}
        </div>
      </div>
    </div>
  );
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-72 flex-1 flex-col items-center justify-center p-8 text-center" role="status">
      {children}
    </div>
  );
}

function GatewayInput({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      <input
        defaultValue={defaultValue}
        className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900 focus:border-[#2847d8] focus:ring-2 focus:ring-[#2847d8]/20 focus:outline-none"
      />
    </label>
  );
}

/** A QR-shaped pattern derived from the order reference. It encodes nothing. */
function FakeQr({ seed }: { seed: string }) {
  const SIZE = 25;
  const cells = useMemo(() => {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const next = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967296;
    };
    const inFinder = (x: number, y: number) =>
      (x < 8 && y < 8) || (x >= SIZE - 8 && y < 8) || (x < 8 && y >= SIZE - 8);
    const out: Array<[number, number]> = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (!inFinder(x, y) && next() > 0.52) out.push([x, y]);
      }
    }
    return out;
  }, [seed]);

  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} fill="#0f172a" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="#0f172a" />
    </g>
  );

  return (
    <svg
      viewBox={`-1 -1 ${SIZE + 2} ${SIZE + 2}`}
      className="size-32 shrink-0 rounded-lg border border-slate-200 bg-white p-1.5"
      role="img"
      aria-label="UPI payment QR code"
      shapeRendering="crispEdges"
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill="#0f172a" />
      ))}
      {finder(0, 0)}
      {finder(SIZE - 7, 0)}
      {finder(0, SIZE - 7)}
    </svg>
  );
}
