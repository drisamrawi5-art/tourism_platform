"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { locales, localeNativeNames, slogans, type Locale } from "@/i18n/config";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * Homepage editor — the CMS surface for the public homepage (Phase 3).
 *
 * Every field maps 1:1 to a `homepage.content.<locale>` setting; an empty
 * field keeps the built-in dictionary copy (nothing is ever invented), and
 * visibility toggles map to `homepage.hiddenSections`. The hero image uses
 * `homepage.heroImageId` pointing at library media that is only rendered
 * publicly once approved/published. All writes go through the audited
 * settings API (`settings.manage` — enforced server-side).
 */

type MediaItem = {
  id: string;
  storageKey: string;
  alt: string;
  status: string;
  kind: string;
};

type FieldSpec = { key: string; labelKey: string; multiline?: boolean };
type GroupSpec = {
  id: string;
  labelKey: string;
  visibleToggle?: boolean;
  fields: FieldSpec[];
};

/** Field keys must match HOMEPAGE_CONTENT_DEFAULT in src/lib/settings.ts. */
const GROUPS: GroupSpec[] = [
  {
    id: "hero",
    labelKey: "admin.homepage.heroGroup",
    fields: [
      { key: "heroEyebrow", labelKey: "admin.homepage.heroEyebrow" },
      { key: "heroHeading", labelKey: "admin.homepage.heroHeading" },
      { key: "heroSubtitle", labelKey: "admin.homepage.heroSubtitle", multiline: true },
      { key: "ctaPlacesLabel", labelKey: "admin.homepage.ctaPlaces" },
      { key: "ctaBookLabel", labelKey: "admin.homepage.ctaBook" },
      { key: "ctaPlanLabel", labelKey: "admin.homepage.ctaPlan" },
    ],
  },
  {
    id: "intro",
    labelKey: "admin.homepage.introGroup",
    visibleToggle: true,
    fields: [
      { key: "introEyebrow", labelKey: "admin.homepage.introEyebrow" },
      { key: "introTitle", labelKey: "admin.homepage.introTitle" },
      { key: "introBody", labelKey: "admin.homepage.introBody", multiline: true },
    ],
  },
  {
    id: "discover",
    labelKey: "admin.homepage.discoverGroup",
    visibleToggle: true,
    fields: [
      { key: "discoverKicker", labelKey: "admin.homepage.discoverKicker" },
      { key: "discoverTitle", labelKey: "admin.homepage.discoverTitle" },
      { key: "exploreLabel", labelKey: "admin.homepage.exploreLabel" },
    ],
  },
  {
    id: "stay",
    labelKey: "admin.homepage.stayGroup",
    visibleToggle: true,
    fields: [
      { key: "stayKicker", labelKey: "admin.homepage.stayKicker" },
      { key: "stayTitle", labelKey: "admin.homepage.stayTitle" },
      { key: "stayBody", labelKey: "admin.homepage.stayBody", multiline: true },
    ],
  },
  {
    id: "guides",
    labelKey: "admin.homepage.guidesGroup",
    visibleToggle: true,
    fields: [
      { key: "guidesTitle", labelKey: "admin.homepage.guidesTitle" },
      { key: "guidesBody", labelKey: "admin.homepage.guidesBody", multiline: true },
    ],
  },
  {
    id: "story",
    labelKey: "admin.homepage.storyGroup",
    visibleToggle: true,
    fields: [
      { key: "storyEyebrow", labelKey: "admin.homepage.storyEyebrow" },
      { key: "storyTitle", labelKey: "admin.homepage.storyTitle" },
      { key: "storyBody", labelKey: "admin.homepage.storyBody", multiline: true },
      { key: "storyCtaLabel", labelKey: "admin.homepage.storyCta" },
    ],
  },
  {
    id: "plan",
    labelKey: "admin.homepage.planGroup",
    visibleToggle: true,
    fields: [
      { key: "planTitle", labelKey: "admin.homepage.planTitle" },
      { key: "planSubtitle", labelKey: "admin.homepage.planSubtitle", multiline: true },
      { key: "planVisitLabel", labelKey: "admin.homepage.planVisit" },
      { key: "galleryLabel", labelKey: "admin.homepage.galleryLabel" },
    ],
  },
];

const ALL_FIELDS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));
const emptyContent = (): Record<string, string> =>
  Object.fromEntries(ALL_FIELDS.map((key) => [key, ""]));

export default function AdminHomepageEditor() {
  const locale = useLocale();
  const dict = getDictionary(locale);

  const [lang, setLang] = useState<Locale>(locale);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [contents, setContents] = useState<Record<string, Record<string, string>>>({});
  const [baselines, setBaselines] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [heroImageId, setHeroImageId] = useState("");
  const [baseGlobal, setBaseGlobal] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<MediaItem | null | undefined>(undefined);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [busyMedia, setBusyMedia] = useState<string | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ settings: Record<string, unknown> }>(
        "/api/v1/admin/settings",
      );
      const s = res.data?.settings ?? {};
      const nextContents: Record<string, Record<string, string>> = {};
      const nextBaselines: Record<string, string> = {};
      for (const l of locales) {
        const stored = s[`homepage.content.${l}`];
        const content = emptyContent();
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
          for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
            if (key in content && typeof value === "string") content[key] = value;
          }
        }
        nextContents[l] = content;
        nextBaselines[l] = JSON.stringify(content);
      }
      const hiddenArr = Array.isArray(s["homepage.hiddenSections"])
        ? (s["homepage.hiddenSections"] as unknown[]).filter(
            (key): key is string => typeof key === "string",
          )
        : [];
      const imageId =
        typeof s["homepage.heroImageId"] === "string" ? s["homepage.heroImageId"] : "";
      setContents(nextContents);
      setBaselines(nextBaselines);
      setHidden(new Set(hiddenArr));
      setHeroImageId(imageId);
      setBaseGlobal(JSON.stringify({ h: [...hiddenArr].sort(), i: imageId }));
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setLoading(false);
    }
  }, [dict]);

  useEffect(() => {
    void load();
  }, [load]);

  // Current hero image preview (media lookup by id, moderation endpoint).
  useEffect(() => {
    if (!heroImageId) {
      setCurrentImage(null);
      return;
    }
    if (currentImage?.id === heroImageId) return;
    let cancelled = false;
    apiFetch<{ media: MediaItem }>(`/api/v1/admin/media/${heroImageId}`)
      .then((res) => {
        if (!cancelled) setCurrentImage(res.data?.media ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [heroImageId, currentImage]);

  const content = contents[lang];
  const dirtyLang = loaded && baselines[lang] !== undefined && JSON.stringify(content) !== baselines[lang];
  const dirtyGlobal =
    loaded &&
    baseGlobal !== null &&
    JSON.stringify({ h: [...hidden].sort(), i: heroImageId }) !== baseGlobal;

  const setField = (key: string, value: string) => {
    setSaveOk(false);
    setContents((prev) => ({ ...prev, [lang]: { ...prev[lang], [key]: value } }));
  };

  const toggleSection = (id: string) => {
    setSaveOk(false);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!loaded) return;
    setSaving(true);
    setError(null);
    setSaveOk(false);
    try {
      if (dirtyLang) {
        await apiFetch("/api/v1/admin/settings", {
          method: "PUT",
          body: { key: `homepage.content.${lang}`, value: contents[lang] },
        });
        const saved = JSON.stringify(contents[lang]);
        setBaselines((prev) => ({ ...prev, [lang]: saved }));
      }
      if (dirtyGlobal) {
        const hiddenArr = [...hidden].sort();
        await apiFetch("/api/v1/admin/settings", {
          method: "PUT",
          body: { key: "homepage.hiddenSections", value: hiddenArr },
        });
        await apiFetch("/api/v1/admin/settings", {
          method: "PUT",
          body: { key: "homepage.heroImageId", value: heroImageId },
        });
        setBaseGlobal(JSON.stringify({ h: hiddenArr, i: heroImageId }));
      }
      setSaveOk(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  const loadLibrary = async () => {
    setLibraryLoading(true);
    try {
      const res = await apiFetch<MediaItem[]>("/api/v1/admin/media?kind=IMAGE&perPage=60");
      setLibrary(res.data ?? []);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setLibraryLoading(false);
    }
  };

  const toggleLibrary = () => {
    setLibraryOpen((open) => {
      if (!open && library.length === 0 && !libraryLoading) void loadLibrary();
      return !open;
    });
  };

  const approveMedia = async (id: string) => {
    setBusyMedia(id);
    setError(null);
    try {
      await apiFetch(`/api/v1/admin/media/${id}`, {
        method: "PATCH",
        body: { status: "APPROVED" },
      });
      setLibrary((prev) => prev.map((m) => (m.id === id ? { ...m, status: "APPROVED" } : m)));
      setCurrentImage((prev) => (prev && prev.id === id ? { ...prev, status: "APPROVED" } : prev));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setBusyMedia(null);
    }
  };

  const startUpload = () => {
    if (!uploadFile || uploadAlt.trim().length < 1 || uploadAlt.length > 300) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/media/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(null);
      let body: { data?: { media?: MediaItem }; error?: { message?: string } } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      const media = body?.data?.media;
      if (xhr.status >= 200 && xhr.status < 300 && media) {
        setLibrary((prev) => [media, ...prev.filter((m) => m.id !== media.id)]);
        setLibraryOpen(true);
        setHeroImageId(media.id);
        setUploadFile(null);
        setUploadAlt("");
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      } else {
        setError(body?.error?.message ?? t(dict, "errors.serverErrorBody"));
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(null);
      setError(t(dict, "errors.serverErrorBody"));
    };
    const form = new FormData();
    form.append("file", uploadFile);
    form.append("alt", uploadAlt.trim());
    xhr.send(form);
  };

  if (loading || !loaded || !content) {
    return <div className="skeleton h-48 w-full" aria-busy="true" />;
  }

  const switchClass = (checked: boolean) =>
    `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
      checked ? "bg-forest-600" : "bg-rocky-300"
    } disabled:cursor-not-allowed disabled:opacity-60`;

  return (
    <div className="space-y-6">
      {saveOk ? (
        <Alert tone="success" role="status">
          {t(dict, "admin.settingsSaved")}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {error}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={t(dict, "admin.homepage.tab")}
          description={t(dict, "admin.homepage.description")}
        />
        <CardBody className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-rocky-700">
              {t(dict, "admin.homepage.contentLang")}
            </span>
            {locales.map((l) => (
              <Button
                key={l}
                variant={l === lang ? "primary" : "ghost"}
                aria-pressed={l === lang}
                onClick={() => {
                  setLang(l);
                  setSaveOk(false);
                }}
                disabled={saving}
              >
                {localeNativeNames[l]}
              </Button>
            ))}
            <ButtonLink
              href={`/${lang}`}
              variant="secondary"
              target="_blank"
              rel="noreferrer"
            >
              {t(dict, "admin.homepage.preview")}
            </ButtonLink>
          </div>

          {GROUPS.map((group) => (
            <fieldset
              key={group.id}
              className="border-t border-rocky-100 pt-4 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-semibold text-rocky-900">
                  {t(dict, group.labelKey)}
                </legend>
                {group.visibleToggle ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!hidden.has(group.id)}
                    aria-label={`${t(dict, "admin.homepage.visibility")} — ${t(dict, group.labelKey)}`}
                    onClick={() => toggleSection(group.id)}
                    disabled={saving}
                    className={switchClass(!hidden.has(group.id))}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        hidden.has(group.id) ? "translate-x-1" : "translate-x-6"
                      }`}
                    />
                  </button>
                ) : null}
              </div>
              {group.visibleToggle && hidden.has(group.id) ? (
                <p className="mt-1 text-xs font-medium text-peach-700">
                  {t(dict, "admin.homepage.visibility")} — {t(dict, "admin.homepage.hiddenLabel")}
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group.fields.map((f) => {
                  const value = content[f.key] ?? "";
                  const isCustom = value.trim() !== "";
                  const hint =
                    f.key === "heroHeading"
                      ? t(dict, "admin.homepage.heroHeadingHint", { slogan: slogans[lang] })
                      : isCustom
                        ? t(dict, "admin.homepage.custom")
                        : t(dict, "admin.homepage.emptyHint", {
                            lang: localeNativeNames[lang],
                          });
                  return (
                    <Field
                      key={f.key}
                      label={t(dict, f.labelKey)}
                      hint={hint}
                      htmlFor={`hp-${lang}-${f.key}`}
                      className={f.multiline ? "sm:col-span-2" : undefined}
                    >
                      {f.multiline ? (
                        <Textarea
                          value={value}
                          onChange={(e) => setField(f.key, e.target.value)}
                          disabled={saving}
                          maxLength={2000}
                        />
                      ) : (
                        <Input
                          value={value}
                          onChange={(e) => setField(f.key, e.target.value)}
                          disabled={saving}
                          maxLength={500}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="flex items-center gap-3 border-t border-rocky-100 pt-4">
            <Button onClick={() => void save()} disabled={saving || (!dirtyLang && !dirtyGlobal)}>
              {t(dict, "common.save")}
            </Button>
            {dirtyGlobal ? (
              <span className="text-xs text-rocky-500">{t(dict, "admin.homepage.image")}</span>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t(dict, "admin.homepage.image")}
          description={t(dict, "admin.homepage.imageHint")}
        />
        <CardBody className="space-y-4">
          {heroImageId ? (
            <div className="flex items-center gap-4">
              {currentImage === undefined ? (
                <div className="skeleton h-20 w-32" aria-busy="true" />
              ) : currentImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- same-origin media file endpoint */}
                  <img
                    src={`/api/v1/media/file/${currentImage.storageKey}`}
                    alt={currentImage.alt}
                    className="h-20 w-32 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-rocky-800">
                      {t(dict, "admin.homepage.currentImage")}
                    </p>
                    <p className="truncate text-xs text-rocky-500" title={currentImage.alt}>
                      {currentImage.alt}
                    </p>
                    <p className="text-xs text-rocky-500">
                      {t(dict, `common.status.${currentImage.status}`)}
                    </p>
                  </div>
                </>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => setHeroImageId("")}
                disabled={saving}
                className="ms-auto"
              >
                {t(dict, "admin.homepage.removeImage")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-rocky-600">{t(dict, "admin.homepage.noImage")}</p>
          )}

          <div>
            <Button variant="secondary" onClick={toggleLibrary} disabled={libraryLoading}>
              {t(dict, "admin.homepage.chooseImage")}
            </Button>
          </div>

          {libraryOpen ? (
            <div className="rounded-lg border border-rocky-200 p-3">
              <p className="mb-2 text-sm font-medium text-rocky-800">
                {t(dict, "admin.homepage.libraryTitle")}
              </p>
              {libraryLoading ? (
                <div className="skeleton h-24 w-full" aria-busy="true" />
              ) : library.length === 0 ? (
                <p className="text-sm text-rocky-500">{t(dict, "admin.homepage.libraryEmpty")}</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {library.map((m) => {
                    const usable = m.status === "APPROVED" || m.status === "PUBLISHED";
                    const selected = m.id === heroImageId;
                    return (
                      <li
                        key={m.id}
                        className={`rounded-lg border p-2 ${
                          selected ? "border-forest-600 ring-2 ring-forest-600/30" : "border-rocky-200"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- same-origin media file endpoint */}
                        <img
                          src={`/api/v1/media/file/${m.storageKey}`}
                          alt={m.alt}
                          loading="lazy"
                          className="h-20 w-full rounded object-cover"
                        />
                        <p className="mt-1 truncate text-xs text-rocky-600" title={m.alt}>
                          {m.alt}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-rocky-400">
                          {t(dict, `common.status.${m.status}`)}
                        </p>
                        <div className="mt-1 flex items-center gap-1">
                          {usable ? (
                            <Button
                              variant="secondary"
                              onClick={() => setHeroImageId(m.id)}
                              disabled={saving || selected}
                            >
                              {selected
                                ? t(dict, "admin.homepage.currentImage")
                                : t(dict, "admin.homepage.useImage")}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => void approveMedia(m.id)}
                              disabled={busyMedia === m.id}
                            >
                              {t(dict, "admin.homepage.approveMedia")}
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          <div className="space-y-3 rounded-lg border border-rocky-200 p-4">
            <Field
              label={t(dict, "admin.homepage.uploadAlt")}
              htmlFor="hp-upload-alt"
              required
              error={
                uploadAlt.length > 0 && uploadAlt.trim().length === 0
                  ? t(dict, "admin.altRequired")
                  : null
              }
            >
              <Input
                value={uploadAlt}
                onChange={(e) => setUploadAlt(e.target.value)}
                disabled={uploading}
                maxLength={300}
              />
            </Field>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading}
              aria-label={t(dict, "admin.homepage.image")}
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-rocky-600 file:mr-3 file:rounded-lg file:border file:border-rocky-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-rocky-700"
            />
            {uploadProgress !== null ? (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
                className="h-2 w-full overflow-hidden rounded-full bg-rocky-200"
              >
                <div
                  className="h-2 rounded-full bg-forest-600 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            ) : null}
            <Button
              onClick={startUpload}
              disabled={uploading || !uploadFile || uploadAlt.trim().length < 1}
            >
              {uploading
                ? t(dict, "admin.homepage.uploading", { percent: uploadProgress ?? 0 })
                : t(dict, "admin.homepage.uploadImage")}
            </Button>
            <p className="text-xs text-rocky-500">
              {t(dict, "admin.homepage.pendingReview")} —{" "}
              <Link href={`/${locale}/admin/media`} className="underline">
                {t(dict, "admin.media")}
              </Link>
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
