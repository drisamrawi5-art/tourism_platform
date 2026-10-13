import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'outline';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-rocky-100 text-rocky-700',
  brand: 'bg-forest-100 text-forest-800',
  info: 'bg-water-100 text-water-900',
  success: 'bg-forest-100 text-forest-800',
  warning: 'bg-peach-100 text-peach-800',
  danger: 'bg-danger-100 text-danger-700',
  outline: 'border border-rocky-300 bg-white text-rocky-700',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
  ...rest
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Map DB enum statuses to badge tones (BookingStatus, PublicationStatus,
 * PaymentStatus, moderation statuses…). Falls back to neutral so unknown
 * values never crash the UI.
 */
export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'PENDING':
    case 'PENDING_REVIEW':
    case 'ON_HOLD':
    case 'PENDING_VERIFICATION':
      return 'warning';
    case 'CONFIRMED':
    case 'APPROVED':
    case 'PUBLISHED':
    case 'PAID':
    case 'SUCCEEDED':
    case 'COMPLETED':
    case 'VERIFIED':
    case 'ACTIVE':
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return 'success';
    case 'CANCELLED':
    case 'FAILED':
    case 'REJECTED':
    case 'SUSPENDED':
    case 'EXPIRED':
    case 'REFUND_FAILED':
      return 'danger';
    case 'DRAFT':
    case 'ARCHIVED':
    case 'REQUIRES_ATTENTION':
      return 'neutral';
    default:
      return 'outline';
  }
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}
