import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, Container, PageHero, Section, SectionHeader } from "@/components/ui/card";

/**
 * Plan Your Visit — process-only page.
 *
 * Every string comes from the dictionary: it explains HOW a visit is planned
 * (discover → choose → check dates → book → confirmation) without stating any
 * destination fact. Transport, seasons, distances and prices are never
 * invented — the pending notice points at what is still unverified.
 */

type Step = {
  title: string;
  body?: string;
  note?: string;
  details?: string[];
  links?: { href: string; label: string }[];
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/plan",
    title: dict.plan.title,
    description: dict.plan.subtitle,
  });
}

export default async function PlanPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale;
  const dict = getDictionary(l);

  const steps: Step[] = [
    {
      title: dict.nav.discover,
      details: [
        dict.plan.destinationOverview,
        dict.plan.placesSection,
        dict.plan.mapSection,
      ],
      links: [{ href: `/${l}/places`, label: dict.nav.places }],
    },
    {
      title: `${dict.plan.staySection} · ${dict.plan.guidesSection}`,
      body: `${dict.home.staySubtitle} ${dict.guides.subtitle}`,
      links: [
        { href: `/${l}/stay`, label: dict.nav.stay },
        { href: `/${l}/guides`, label: dict.nav.guides },
      ],
    },
    {
      title: dict.booking.steps.dates,
      details: [
        dict.booking.checkIn,
        dict.booking.checkOut,
        dict.booking.guests,
        dict.stay.checkAvailability,
      ],
    },
    {
      title: dict.nav.bookNow,
      body: dict.payment.secureNote,
      details: [
        dict.booking.reviewBeforePay,
        dict.booking.payDeposit,
        dict.booking.payFull,
        dict.booking.confirmBooking,
      ],
    },
    {
      title: dict.booking.steps.confirmation,
      body: dict.booking.confirmationBody,
      note: dict.booking.nextStepsBody,
      details: [
        dict.booking.reference,
        dict.booking.paymentStatus,
        dict.booking.bookingStatus,
      ],
    },
  ];

  // FAQ only answers process questions we can answer from the dictionary —
  // no factual claims about the destination.
  const faq = [
    { q: dict.booking.steps.confirmation, a: dict.booking.nextStepsBody },
    { q: dict.payment.title, a: dict.payment.secureNote },
    { q: dict.payment.notConfigured, a: dict.payment.notConfiguredBody },
  ];

  return (
    <>
      <PageHero kicker={dict.brand.tagline} title={dict.plan.title} description={dict.plan.subtitle}>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/${l}/places`}>{dict.nav.places}</ButtonLink>
          <ButtonLink href={`/${l}/stay`} variant="accent">
            {dict.nav.stay}
          </ButtonLink>
          <ButtonLink href={`/${l}/guides`} variant="secondary">
            {dict.nav.guides}
          </ButtonLink>
        </div>
      </PageHero>

      {/* Process steps */}
      <Section>
        <Container>
          <SectionHeader
            kicker={dict.nav.plan}
            title={dict.plan.bookingInfo}
            description={dict.plan.bookingInfoBody}
          />
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card>
                  <CardBody>
                    <div className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest-600 text-sm font-semibold text-white"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-lg font-semibold text-rocky-900">
                          {step.title}
                        </h3>
                        {step.body ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-rocky-600">
                            {step.body}
                          </p>
                        ) : null}
                        {step.note ? (
                          <p className="mt-2 text-sm leading-relaxed text-rocky-600">
                            {step.note}
                          </p>
                        ) : null}
                        {step.details?.length ? (
                          <ul className="mt-3 flex flex-wrap gap-2">
                            {step.details.map((detail) => (
                              <li key={detail}>
                                <span className="inline-flex rounded-full border border-rocky-200 bg-rocky-50 px-2.5 py-0.5 text-xs font-medium text-rocky-700">
                                  {detail}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {step.links?.length ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {step.links.map((link) => (
                              <ButtonLink
                                key={link.href}
                                href={link.href}
                                variant="secondary"
                                size="sm"
                              >
                                {link.label}
                              </ButtonLink>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      {/* Honest pending notice — no transport/season claims */}
      <Section className="pt-0">
        <Container className="max-w-3xl">
          <Alert tone="info">{dict.plan.practicalInfoPending}</Alert>
        </Container>
      </Section>

      {/* Cancellations */}
      <Section>
        <Container>
          <SectionHeader title={dict.booking.cancellationPolicy} />
          <Card>
            <CardBody className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm leading-relaxed text-rocky-600">
                {dict.legal.pending}
              </p>
              <ButtonLink href={`/${l}/legal/cancellation`} variant="secondary" size="sm">
                {dict.footer.cancellation}
              </ButtonLink>
            </CardBody>
          </Card>
        </Container>
      </Section>

      {/* FAQ — process questions only */}
      <Section className="pt-0">
        <Container>
          <SectionHeader title={dict.home.planSubtitle} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {faq.map((item) => (
              <Card key={item.q}>
                <CardBody>
                  <h3 className="font-display text-base font-semibold text-rocky-900">
                    {item.q}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-rocky-600">{item.a}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </Container>
      </Section>
    </>
  );
}
