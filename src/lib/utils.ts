import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Indian-format currency, no decimals -- these are always whole rupees. */
export function formatINR(amount: number): string {
  return `\u20b9${amount.toLocaleString('en-IN')}`;
}

/** "3 days left" / "Today" / "Tomorrow" for move-out countdowns. */
export function formatDaysLeft(days: number): string {
  if (days <= 0) return 'Moving out today';
  if (days === 1) return 'Moving out tomorrow';
  return `${days} days left`;
}
