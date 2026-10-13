"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/password-input";
import {
  fieldErrors,
  formError,
  useRedirectIfAuthenticated,
} from "@/components/auth/helpers";

/** Mirrors the server-side Zod rule (min 10) without pulling server code in. */
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

export function RegisterForm({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const providerMode = searchParams.get("role") === "provider";

  useRedirectIfAuthenticated(locale, next);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [wantsProvider, setWantsProvider] = useState(providerMode);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formErrorText, setFormErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setErrors({});
    setFormErrorText(null);

    if (password !== confirm) {
      setErrors({ confirmPassword: t(dict, "common.error") });
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/register", {
        method: "POST",
        body: {
          email: email.trim(),
          password,
          ...(name.trim() ? { name: name.trim() } : {}),
          locale,
          ...(providerMode ? { wantsProvider } : {}),
        },
      });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "EMAIL_TAKEN") {
        // Anti-enumeration copy stays deliberately generic (dict fallback).
        setErrors({ email: t(dict, "common.error") });
      } else if (error instanceof ApiClientError && Object.keys(error.details ?? {}).length > 0) {
        setErrors(fieldErrors(error));
        setFormErrorText(formError(error, dict));
      } else {
        setFormErrorText(formError(error, dict));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-20">
        <Card>
          <CardBody className="space-y-6 text-center">
            <h1 className="font-display text-2xl font-semibold text-rocky-900">
              {t(dict, "auth.registerTitle")}
            </h1>
            <Alert tone="success" role="status">
              {t(dict, "auth.accountCreated")}
            </Alert>
            <p className="text-sm text-rocky-600">{t(dict, "auth.verifyEmailBody")}</p>
            <ButtonLink href={`/${locale}/login`} className="w-full">
              {t(dict, "auth.signIn")}
            </ButtonLink>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <Card>
        <CardBody className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold text-rocky-900">
              {t(dict, "auth.registerTitle")}
            </h1>
          </div>

          {formErrorText ? (
            <Alert tone="danger" role="alert">
              {formErrorText}
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field
              label={t(dict, "auth.name")}
              htmlFor="register-name"
              hint={t(dict, "common.optional")}
              error={errors.name}
            >
              <Input
                id="register-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field label={t(dict, "auth.email")} htmlFor="register-email" required error={errors.email}>
              <Input
                id="register-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field
              label={t(dict, "auth.password")}
              htmlFor="register-password"
              required
              error={errors.password}
            >
              <PasswordInput
                dict={dict}
                id="register-password"
                name="password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </Field>

            <Field
              label={t(dict, "auth.confirmPassword")}
              htmlFor="register-confirm"
              required
              error={errors.confirmPassword ?? errors.confirm}
            >
              <PasswordInput
                dict={dict}
                id="register-confirm"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
              />
            </Field>

            {providerMode ? (
              <div className="rounded-lg border border-rocky-200 bg-rocky-50 p-4">
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="wantsProvider"
                    checked={wantsProvider}
                    onChange={(e) => setWantsProvider(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-rocky-300 accent-forest-600"
                  />
                  <span className="text-rocky-800">{t(dict, "footer.becomeProvider")}</span>
                </label>
                <p className="mt-2 text-xs leading-relaxed text-rocky-600">
                  {t(dict, "auth.providerNote")}
                </p>
              </div>
            ) : null}

            <Button type="submit" className="w-full" loading={submitting}>
              {t(dict, "auth.register")}
            </Button>
          </form>

          <div className="border-t border-rocky-200 pt-4 text-center text-sm text-rocky-600">
            {t(dict, "auth.haveAccount")}{" "}
            <Link
              href={`/${locale}/login`}
              className="font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
            >
              {t(dict, "auth.signIn")}
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
