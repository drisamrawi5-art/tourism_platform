import type { Metadata } from 'next';
import { getDictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { buildMetadata } from '@/lib/seo';
import { ButtonLink } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Container, PageHero, Section } from '@/components/ui/card';

/**
 * Shared shell for the six legal documents (terms, privacy, booking terms,
 * cancellation, provider terms, cookies).
 *
 * The documents are written by the platform operators and published later —
 * this shell only renders the title, the honest "pending" notice and a way
 * back home. It never fabricates legal clauses.
 */

/** Metadata for a legal document: localized title + pending description. */
export function legalMetadata(input: {
  locale: Locale;
  /** Path AFTER the locale segment, e.g. "/legal/privacy". */
  path: string;
  title: string;
}): Metadata {
  return buildMetadata({
    locale: input.locale,
    path: input.path,
    title: input.title,
    description: getDictionary(input.locale).legal.pending,
  });
}

export function LegalShell({ locale, title }: { locale: Locale; title: string }) {
  const dict = getDictionary(locale);

  return (
    <>
      <PageHero kicker={dict.legal.title} title={title} />
      <Section>
        <Container className="flex max-w-3xl flex-col items-start gap-6">
          <Alert tone="info">{dict.legal.pending}</Alert>
          <ButtonLink href={`/${locale}`} variant="secondary">
            {dict.errors.goHome}
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
