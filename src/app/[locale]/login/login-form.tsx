"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/password-input";
import {
  fieldErrors,
  formError,
  safeNextPath,
  useRedirectIfAuthenticated,
} from "@/components/auth/helpers";

export function LoginForm({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const role = searchParams.get("role");

  useRedirectIfAuthenticated(locale, next);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formErrorText, setFormErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormErrorText(null);

    try {
      await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      const target = safeNextPath(next, `/${locale}/account`);
      router.replace(target);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setFormErrorText(t(dict, "auth.invalidCredentials"));
        setPassword("");
      } else if (error instanceof ApiClientError && Object.keys(error.details ?? {}).length > 0) {
        setErrors(fieldErrors(error));
        setFormErrorText(formError(error, dict));
      } else {
        setFormErrorText(formError(error, dict));
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <Card>
        <CardBody className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold text-rocky-900">
              {t(dict, "auth.signInTitle")}
            </h1>
            {role === "provider" ? (
              <div className="mt-4 text-start">
                <Alert tone="info" title={t(dict, "home.becomeProvider")}>
                  {t(dict, "auth.providerNote")}
                </Alert>
              </div>
            ) : null}
          </div>

          {formErrorText ? (
            <Alert tone="danger" role="alert">
              {formErrorText}
            </Alert>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field label={t(dict, "auth.email")} htmlFor="login-email" required error={errors.email}>
              <Input
                id="login-email"
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
              htmlFor="login-password"
              required
              error={errors.password}
            >
              <PasswordInput
                dict={dict}
                id="login-password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </Field>

            <div className="flex items-center justify-end">
              <Link
                href={`/${locale}/password-forgot`}
                className="text-sm text-water-700 underline underline-offset-2 hover:text-water-800"
              >
                {t(dict, "auth.forgotPassword")}
              </Link>
            </div>

            <Button type="submit" className="w-full" loading={submitting}>
              {t(dict, "auth.signIn")}
            </Button>
          </form>

          <div className="border-t border-rocky-200 pt-4 text-center text-sm text-rocky-600">
            {t(dict, "auth.noAccount")}{" "}
            <Link
              href={`/${locale}/register${role === "provider" ? "?role=provider" : ""}`}
              className="font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
            >
              {t(dict, "auth.register")}
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
