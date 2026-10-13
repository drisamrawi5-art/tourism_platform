"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { fieldErrors, formError } from "@/components/auth/helpers";

export function ForgotPasswordForm({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formErrorText, setFormErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors({});
    setFormErrorText(null);

    try {
      await apiFetch("/api/v1/auth/password-forgot", {
        method: "POST",
        body: { email: email.trim(), locale },
      });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && Object.keys(error.details ?? {}).length > 0) {
        setErrors(fieldErrors(error));
      }
      setFormErrorText(formError(error, dict));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <Card>
        <CardBody className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold text-rocky-900">
              {t(dict, "auth.forgotTitle")}
            </h1>
            <p className="mt-2 text-sm text-rocky-600">{t(dict, "auth.forgotBody")}</p>
          </div>

          {done ? (
            <>
              <Alert tone="success" role="status">
                {t(dict, "auth.resetSent")}
              </Alert>
              <ButtonLink href={`/${locale}/login`} variant="secondary" className="w-full">
                {t(dict, "auth.signIn")}
              </ButtonLink>
            </>
          ) : (
            <>
              {formErrorText ? (
                <Alert tone="danger" role="alert">
                  {formErrorText}
                </Alert>
              ) : null}

              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <Field
                  label={t(dict, "auth.email")}
                  htmlFor="forgot-email"
                  required
                  error={errors.email}
                >
                  <Input
                    id="forgot-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                  />
                </Field>

                <Button type="submit" className="w-full" loading={submitting}>
                  {t(dict, "auth.sendResetLink")}
                </Button>
              </form>

              <p className="border-t border-rocky-200 pt-4 text-center text-sm text-rocky-600">
                <Link
                  href={`/${locale}/login`}
                  className="text-water-700 underline underline-offset-2 hover:text-water-800"
                >
                  {t(dict, "auth.signIn")}
                </Link>
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
