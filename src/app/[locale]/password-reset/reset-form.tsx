"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/password-input";
import { fieldErrors, formError } from "@/components/auth/helpers";

/** Mirrors the server-side Zod rule (min 10). */
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

export function ResetPasswordForm({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formErrorText, setFormErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const tokenMissing = !token;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !token) return;

    setErrors({});
    setFormErrorText(null);

    if (password !== confirm) {
      setErrors({ confirmPassword: t(dict, "common.error") });
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/v1/auth/password-reset", {
        method: "POST",
        body: { token, password },
      });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "INVALID_TOKEN") {
        setFormErrorText(formError(error, dict));
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

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <Card>
        <CardBody className="space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl font-semibold text-rocky-900">
              {t(dict, "auth.resetTitle")}
            </h1>
          </div>

          {done ? (
            <>
              <Alert tone="success" role="status">
                {t(dict, "auth.resetDone")}
              </Alert>
              <ButtonLink href={`/${locale}/login`} className="w-full">
                {t(dict, "auth.signIn")}
              </ButtonLink>
            </>
          ) : tokenMissing ? (
            <>
              <Alert tone="danger" role="alert">
                {t(dict, "common.error")}
              </Alert>
              <ButtonLink href={`/${locale}/password-forgot`} variant="secondary" className="w-full">
                {t(dict, "auth.sendResetLink")}
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
                  label={t(dict, "auth.newPassword")}
                  htmlFor="reset-password"
                  required
                  error={errors.password}
                >
                  <PasswordInput
                    dict={dict}
                    id="reset-password"
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
                  htmlFor="reset-confirm"
                  required
                  error={errors.confirmPassword ?? errors.confirm}
                >
                  <PasswordInput
                    dict={dict}
                    id="reset-confirm"
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

                <Button type="submit" className="w-full" loading={submitting}>
                  {t(dict, "common.submit")}
                </Button>
              </form>

              <p className="border-t border-rocky-200 pt-4 text-center text-sm">
                <ButtonLink href={`/${locale}/password-forgot`} variant="link">
                  {t(dict, "auth.forgotPassword")}
                </ButtonLink>
              </p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
