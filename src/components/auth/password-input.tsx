'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/field';
import type { Dictionary } from '@/i18n';

/**
 * Password field with a show/hide toggle.
 * The toggle announces the field it controls (dictionary copy only).
 */
export function PasswordInput({
  dict,
  className,
  ...rest
}: {
  dict: Dictionary;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={className ? `${className} pe-10` : 'pe-10'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={dict.auth.password}
        title={dict.auth.password}
        className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-lg text-rocky-500 transition-colors hover:text-rocky-700 focus-visible:outline-2 focus-visible:outline-water-600"
      >
        {visible ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3l18 18M10.6 10.7a2 2 0 002.8 2.8M9.9 4.2A10.5 10.5 0 0112 4c5.5 0 9 5.5 9 8a9.6 9.6 0 01-2.3 3.6M6.2 6.3C4 7.9 3 10.4 3 12c0 2.5 3.5 8 9 8a10.4 10.4 0 004-.8"
            />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="size-5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2 12s3.5-8 10-8 10 8 10 8-3.5 8-10 8-10-8-10-8z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
