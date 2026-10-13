'use client';

import { t, type Dictionary } from '@/i18n';

/**
 * Accessible 1–5 rating control (radio group with a legend).
 * Stars are decoration — every option carries an SR-only localized label.
 */
export function StarRating({
  dict,
  name,
  value,
  onChange,
  disabled = false,
}: {
  dict: Dictionary;
  name: string;
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium text-rocky-800">
        {t(dict, 'reviews.rating')}
      </legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={`inline-flex cursor-pointer items-center rounded-md p-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-water-600/50 ${
              disabled ? 'cursor-not-allowed opacity-60' : ''
            }`}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <svg
              viewBox="0 0 24 24"
              className={`size-7 ${value >= n ? 'text-peach-500' : 'text-rocky-300'}`}
              fill={value >= n ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3.6l2.6 5.3 5.9.9-4.3 4.2 1 5.8L12 17.1l-5.2 2.7 1-5.8L3.5 9.8l5.9-.9L12 3.6z"
              />
            </svg>
            <span className="sr-only">{t(dict, 'reviews.stars', { n })}</span>
          </label>
        ))}
        <span className="ms-2 text-sm text-rocky-600" aria-live="polite">
          {value > 0 ? t(dict, 'reviews.stars', { n: value }) : ''}
        </span>
      </div>
    </fieldset>
  );
}
