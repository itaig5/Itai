import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtPct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;
export const fmtPp = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}pp`;
export const fmtMoney = (v: number) => `€${v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0)}`;
export const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Fixed channel -> series-slot map: color follows the entity, never its rank. */
export const CHANNEL_COLOR: Record<string, string> = {
  booking: 'var(--series-1)',
  airbnb: 'var(--series-6)',
  expedia: 'var(--series-3)',
  vrbo: 'var(--series-4)',
  direct: 'var(--series-5)',
};

export const CHANNEL_LABEL: Record<string, string> = {
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  expedia: 'Expedia',
  vrbo: 'Vrbo',
  direct: 'Direct',
};

export const MOVE_LABEL: Record<string, string> = {
  last_minute: 'Last-minute deal',
  weekly_los: 'Weekly length-of-stay',
  basic_deal: 'Basic deal',
  early_booker: 'Early-booker deal',
  remove_discounts: 'Remove discounts',
  new_listing: 'New-listing promo',
  none: 'No action',
};
