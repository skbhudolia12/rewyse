/**
 * UI primitives — "Move-out season".
 *
 * Every interactive target is at least 44px tall: this is used one-handed in a
 * hostel corridor, and anything smaller is a miss-tap.
 *
 * On flame: it is NOT the primary-button colour by default. It marks time
 * running out — countdowns, clearance, sell-fast prices, and the single
 * commit action on a page. Paper (off-white on black) carries ordinary
 * primary actions. Reach for `tone="flame"` deliberately.
 */

import { cn } from '@/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'flame' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition',
        'focus-visible:ring-flame focus-visible:ring-offset-ink focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        'active:translate-y-px',
        size === 'lg' ? 'min-h-12 px-6 text-[15px]' : 'min-h-11 px-4 text-sm',
        variant === 'primary' && 'bg-paper text-ink hover:bg-paper-dim font-semibold',
        variant === 'flame' &&
          'bg-flame text-ink hover:bg-flame-bright font-semibold',
        variant === 'secondary' &&
          'border-hairline-strong text-paper hover:bg-surface hover:border-paper-faint border bg-transparent',
        variant === 'ghost' && 'text-paper-dim hover:text-paper bg-transparent',
        variant === 'danger' && 'bg-danger text-ink font-semibold hover:brightness-110',
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'border-hairline-strong text-paper bg-ink min-h-12 w-full rounded-lg border px-4',
        'placeholder:text-paper-faint',
        'focus:border-flame focus:ring-flame/25 focus:ring-2 focus:outline-none',
        'disabled:text-paper-dim disabled:cursor-not-allowed disabled:opacity-60',
        'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/25',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-hairline-strong text-paper bg-ink min-h-24 w-full rounded-lg border px-4 py-3',
        'placeholder:text-paper-faint',
        'focus:border-flame focus:ring-flame/25 focus:ring-2 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'border-hairline-strong text-paper bg-ink min-h-12 w-full rounded-lg border px-3.5',
        'focus:border-flame focus:ring-flame/25 focus:ring-2 focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | undefined;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
        {optional && <span className="text-paper-faint ml-2 text-xs font-normal">Optional</span>}
      </label>
      {hint && !error && <p className="text-paper-dim text-[13px] leading-relaxed">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-hairline bg-ink-raised rounded-xl border p-5', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & {
  tone?: 'neutral' | 'verify' | 'flame' | 'danger' | 'solid';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold',
        tone === 'neutral' && 'border-hairline-strong text-paper-dim border',
        tone === 'verify' && 'bg-verify-soft text-verify',
        tone === 'flame' && 'bg-flame-soft text-flame-bright',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'solid' && 'bg-flame text-ink',
        className,
      )}
      {...props}
    />
  );
}

/**
 * The product's signature element. Flame only inside the clearance window --
 * a countdown that is always orange is not a countdown, it is a decoration.
 */
export function DaysLeft({
  days,
  className,
  size = 'md',
}: {
  days: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const critical = days <= 3;
  const soon = days <= 7;
  const label = days <= 0 ? 'Moving out today' : days === 1 ? '1 day left' : `${days} days left`;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full font-semibold',
        size === 'lg' ? 'px-4 py-2 text-sm' : size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        critical
          ? 'bg-flame text-ink'
          : soon
            ? 'bg-flame-soft text-flame-bright'
            : 'border-hairline-strong text-paper-dim border',
        className,
      )}
    >
      {soon && (
        <span
          className={cn(
            'pulse-dot inline-block size-1.5 rounded-full',
            critical ? 'bg-ink' : 'bg-flame',
          )}
        />
      )}
      {label}
    </span>
  );
}

export function Alert({
  tone = 'error',
  title,
  children,
}: {
  tone?: 'error' | 'info' | 'success';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border px-4 py-3.5 text-sm leading-relaxed',
        tone === 'error' && 'border-danger/40 bg-danger-soft text-danger',
        tone === 'info' && 'border-hairline-strong bg-surface text-paper-dim',
        tone === 'success' && 'border-verify/35 bg-verify-soft text-verify',
      )}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  return (
    <header className="space-y-2">
      {eyebrow && <p className="text-paper-dim text-sm font-medium">{eyebrow}</p>}
      <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
      {subtitle && <p className="text-paper-dim max-w-prose text-[15px] leading-relaxed">{subtitle}</p>}
    </header>
  );
}

/** Wordmark. The dot is the only place flame appears as pure brand. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display inline-flex items-baseline text-[22px]', className)}>
      <span className="sr-only">Dobara</span>
      {/* "दो" + "bara": half Hindi, half English, read as one word -- "again". */}
      <span
        aria-hidden
        lang="hi"
        className="font-devanagari text-flame text-[1.08em] leading-none font-extrabold tracking-normal"
      >
        दो
      </span>
      <span aria-hidden className="ml-[0.03em] tracking-[-0.04em]">
        bara
      </span>
    </span>
  );
}

/** Grey shimmer block for loading states, sized by the caller. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('bg-surface animate-pulse rounded-lg', className)} />;
}
