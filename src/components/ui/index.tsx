/**
 * UI primitives.
 *
 * Kept in one file while the set is small -- splitting eight short components
 * across eight files costs more to navigate than it saves. Split when this
 * stops fitting on a screen or two.
 *
 * Every interactive target is at least 44px tall: this is a phone-first app and
 * anything smaller is a miss-tap on a crowded hostel corridor.
 */

import { cn } from '@/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition',
        'focus-visible:ring-brand-500 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'lg' ? 'min-h-13 px-6 text-base' : 'min-h-11 px-4 text-sm',
        variant === 'primary' && 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm',
        variant === 'secondary' &&
          'border-border bg-surface hover:bg-surface-muted border text-[var(--foreground)]',
        variant === 'ghost' && 'hover:bg-surface-muted text-[var(--muted)]',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
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
        'border-border bg-surface min-h-11 w-full rounded-xl border px-3.5',
        'placeholder:text-[var(--muted)]',
        'focus:border-brand-500 focus:ring-brand-500/30 focus:ring-2 focus:outline-none',
        'disabled:bg-surface-muted disabled:cursor-not-allowed',
        'aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-500/30',
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
        'border-border bg-surface min-h-11 w-full rounded-xl border px-3',
        'focus:border-brand-500 focus:ring-brand-500/30 focus:ring-2 focus:outline-none',
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
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">Optional</span>}
      </label>
      {hint && !error && <p className="text-xs text-[var(--muted)]">{hint}</p>}
      {children}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-border bg-surface rounded-2xl border p-4 shadow-sm', className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & {
  tone?: 'neutral' | 'verify' | 'urgency' | 'critical' | 'brand';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tone === 'neutral' && 'bg-surface-muted text-[var(--muted)]',
        tone === 'verify' && 'bg-verify-100 text-verify-700',
        tone === 'urgency' && 'bg-urgency-100 text-urgency-700',
        tone === 'critical' && 'bg-red-100 text-red-700',
        tone === 'brand' && 'bg-brand-100 text-brand-800',
        className,
      )}
      {...props}
    />
  );
}

/** Shown when an action fails. Errors are never swallowed into a silent no-op. */
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
        'rounded-xl border px-4 py-3 text-sm',
        tone === 'error' && 'border-red-200 bg-red-50 text-red-800',
        tone === 'info' && 'border-brand-200 bg-brand-50 text-brand-900',
        tone === 'success' && 'border-verify-100 bg-verify-100 text-verify-700',
      )}
    >
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

/** Page heading block, consistent across every screen. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-[var(--muted)]">{subtitle}</p>}
    </header>
  );
}
