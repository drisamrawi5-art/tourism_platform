"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n";

/** Localised 404 (rendered for notFound() thrown under /{locale}). */
export default function LocaleNotFound() {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = isLocale(params?.locale) ? params.locale : "en";
  const dict = getDictionary(locale);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-20 text-center sm:px-6">
      <p className="font-display text-7xl font-semibold text-forest-700">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-rocky-900">
        {dict.errors.notFound}
      </h1>
      <p className="mt-2 text-base leading-relaxed text-rocky-600">
        {dict.errors.notFoundBody}
      </p>
      <Link
        href={`/${locale}`}
        className="mt-8 inline-flex h-11 items-center rounded-lg bg-forest-600 px-6 text-sm font-medium text-white transition-colors hover:bg-forest-700"
      >
        {dict.errors.goHome}
      </Link>
    </div>
  );
}
