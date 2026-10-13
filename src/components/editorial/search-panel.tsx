'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { t, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { ApiClientError, apiFetch, qs } from '@/lib/api/client';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Button, LoadingBlock } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

/**
 * Client-side site search.
 *
 * Fetches GET /api/v1/search (owned by the API layer) and renders grouped
 * results. The response payload is parsed defensively: either keyed groups
 * ({ places, accommodations, guides, content }) or a flat list of hits — the
 * page never invents data it did not receive.
 */

type GroupKey = 'place' | 'accommodation' | 'guide' | 'content';

type Hit = {
  type: GroupKey;
  title: string;
  slug: string;
  summary: string | null;
};

type ErrorKind = 'rate' | 'network' | 'generic';

/** Response key → result group (singular and plural spellings accepted). */
const GROUP_BY_KEY: Record<string, GroupKey> = {
  place: 'place',
  places: 'place',
  accommodation: 'accommodation',
  accommodations: 'accommodation',
  stay: 'accommodation',
  stays: 'accommodation',
  guide: 'guide',
  guides: 'guide',
  content: 'content',
  contents: 'content',
  article: 'content',
  articles: 'content',
  story: 'content',
  stories: 'content',
  journal: 'content',
};

/** Hit `type`/`kind`/`category` value → result group. */
const GROUP_BY_VALUE: Record<string, GroupKey> = {
  place: 'place',
  accommodation: 'accommodation',
  accommodations: 'accommodation',
  stay: 'accommodation',
  guide: 'guide',
  content: 'content',
  article: 'content',
  story: 'content',
  journal: 'content',
};

const FLAT_LIST_KEYS = ['items', 'results', 'data', 'hits'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function groupOf(value: unknown): GroupKey | null {
  if (typeof value !== 'string') return null;
  return GROUP_BY_VALUE[value.toLowerCase()] ?? null;
}

function toHit(value: unknown, fallbackType: GroupKey): Hit | null {
  const record = asRecord(value);
  if (!record) return null;

  const slug = typeof record.slug === 'string' ? record.slug : null;
  const title =
    typeof record.title === 'string'
      ? record.title
      : typeof record.name === 'string'
        ? record.name
        : null;
  if (!slug || !title) return null;

  const explicit = groupOf(record.type) ?? groupOf(record.kind) ?? groupOf(record.category);
  const summary =
    typeof record.summary === 'string'
      ? record.summary
      : typeof record.description === 'string'
        ? record.description
        : typeof record.typeLabel === 'string'
          ? record.typeLabel
          : null;

  return { type: explicit ?? fallbackType, title, slug, summary };
}

function parsePayload(raw: unknown, paginationTotal?: number): { hits: Hit[]; total: number } {
  const hits: Hit[] = [];
  let total: number | null = null;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const hit = toHit(item, 'place');
      if (hit) hits.push(hit);
    }
  } else {
    const record = asRecord(raw);
    if (record) {
      if (typeof record.total === 'number') total = record.total;
      if (typeof record.totalHits === 'number') total = record.totalHits;

      let found = false;
      for (const [key, value] of Object.entries(record)) {
        const fallback = GROUP_BY_KEY[key.toLowerCase()];
        if (!fallback || !Array.isArray(value)) continue;
        found = true;
        for (const item of value) {
          const hit = toHit(item, fallback);
          if (hit) hits.push(hit);
        }
      }

      if (!found) {
        for (const key of FLAT_LIST_KEYS) {
          const list = record[key];
          if (!Array.isArray(list)) continue;
          for (const item of list) {
            const hit = toHit(item, 'place');
            if (hit) hits.push(hit);
          }
        }
      }
    }
  }

  return { hits, total: paginationTotal ?? total ?? hits.length };
}

function hrefFor(locale: Locale, hit: Hit): string {
  switch (hit.type) {
    case 'place':
      return `/${locale}/places/${hit.slug}`;
    case 'accommodation':
      return `/${locale}/stay/${hit.slug}`;
    case 'guide':
      return `/${locale}/guides/${hit.slug}`;
    case 'content':
      return `/${locale}/journal/${hit.slug}`;
  }
}

const GROUP_ORDER: GroupKey[] = ['place', 'accommodation', 'guide', 'content'];

export function SearchPanel({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorKind, setErrorKind] = useState<ErrorKind>('generic');

  const run = useCallback(
    async (rawQuery: string, rawType: string) => {
      const q = rawQuery.trim();
      if (!q) {
        setHits(null);
        setTotal(0);
        setSubmittedQuery('');
        setStatus('idle');
        return;
      }

      setStatus('loading');
      try {
        const envelope = await apiFetch<unknown>(
          `/api/v1/search${qs({
            q,
            type: rawType || undefined,
            locale,
            perPage: 10,
          })}`,
        );
        const parsed = parsePayload(envelope.data, envelope.pagination?.total);
        setHits(parsed.hits);
        setTotal(parsed.total);
        setSubmittedQuery(q);
        setStatus('done');
      } catch (error) {
        if (error instanceof ApiClientError) {
          if (error.status === 429 || error.code === 'RATE_LIMITED') {
            setErrorKind('rate');
          } else if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
            setErrorKind('network');
          } else {
            setErrorKind('generic');
          }
        } else {
          setErrorKind('generic');
        }
        setStatus('error');
      }
    },
    [locale],
  );

  // Initial ?q= from the URL runs once on mount.
  useEffect(() => {
    if (initialQuery) void run(initialQuery, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(query, type);
  }

  const grouped = GROUP_ORDER.map((key) => ({
    key,
    hits: (hits ?? []).filter((hit) => hit.type === key),
  })).filter((group) => group.hits.length > 0);

  return (
    <div className="space-y-8">
      <Card>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label={dict.search.title} htmlFor="site-search" className="flex-1">
              <Input
                name="q"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={dict.search.placeholder}
                autoComplete="off"
              />
            </Field>
            <Field label={dict.places.typeLabel} htmlFor="site-search-type" className="sm:w-56">
              <Select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="">{dict.common.all}</option>
                <option value="place">{dict.search.categories.place}</option>
                <option value="accommodation">{dict.search.categories.accommodation}</option>
                <option value="guide">{dict.search.categories.guide}</option>
                <option value="content">{dict.search.categories.content}</option>
              </Select>
            </Field>
            <Button type="submit" loading={status === 'loading'} className="sm:w-auto">
              {dict.common.search}
            </Button>
          </form>
        </CardBody>
      </Card>

      {status === 'loading' ? <LoadingBlock text={dict.common.loading} /> : null}

      {status === 'error' ? (
        <Alert
          tone={errorKind === 'rate' ? 'warning' : 'danger'}
          role="alert"
          title={
            errorKind === 'rate'
              ? dict.errors.rateLimited
              : errorKind === 'network'
                ? dict.errors.offline
                : dict.errors.serverError
          }
        >
          {errorKind === 'generic' ? <p>{dict.errors.serverErrorBody}</p> : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void run(query, type)}
          >
            {dict.common.retry}
          </Button>
        </Alert>
      ) : null}

      {status === 'done' && (total === 0 || grouped.length === 0) ? (
        <EmptyState title={dict.search.empty} description={dict.common.noResults} />
      ) : null}

      {status === 'done' && total > 0 && grouped.length > 0 ? (
        <div className="space-y-6">
          <p className="font-display text-lg font-semibold text-rocky-900">
            {t(dict, 'search.resultsFor', { q: submittedQuery })}
          </p>
          {grouped.map((group) => (
            <Card key={group.key}>
              <CardHeader
                title={
                  group.key === 'place'
                    ? dict.nav.places
                    : group.key === 'accommodation'
                      ? dict.nav.stay
                      : group.key === 'guide'
                        ? dict.nav.guides
                        : dict.nav.journal
                }
              />
              <CardBody className="p-0">
                <ul className="divide-y divide-rocky-100">
                  {group.hits.map((hit) => (
                    <li key={`${hit.type}:${hit.slug}`}>
                      <Link
                        href={hrefFor(locale, hit)}
                        className="block px-5 py-4 text-start transition-colors hover:bg-rocky-50"
                      >
                        <span className="block text-sm font-medium text-rocky-900">
                          {hit.title}
                        </span>
                        {hit.summary ? (
                          <span className="mt-0.5 block line-clamp-2 text-sm text-rocky-600">
                            {hit.summary}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
