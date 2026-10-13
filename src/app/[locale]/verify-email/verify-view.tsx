"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { fetchMe, fieldErrors, formError, type AuthUser } from "@/components/auth/helpers";

type State = "verifying" | "success" | "error";

export function VerifyEmailView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  const started = useRef(false);

  // Verify exactly once per mount.
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState("error");
      setMessage(t(dict, "common.error"));
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await apiFetch("/api/v1/auth/verify-email", { method: "POST", body: { token } });
        if (!cancelled) setState("success");
      } catch (error) {
        if (cancelled) return;
        setMessage(formError(error, dict));
        setFieldError(fieldErrors(error).token ?? null);
        setState("error");
        setCurrentUser(await fetchMe());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, dict]);

  async function onResend() {
    if (resendState !== "idle") return;
    setResendState("sending");
    try {
      await apiFetch("/api/v1/auth/verify-email/resend", { method: "POST", body: {} });
      setResendState("sent");
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setCurrentUser(null);
      }
      setMessage(formError(error, dict));
      setResendState("idle");
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:px-6 sm:py-20">
      <Card>
        <CardBody className="space-y-6 text-center">
          <h1 className="font-display text-2xl font-semibold text-rocky-900">
            {t(dict, "auth.verifyEmailTitle")}
          </h1>

          {state === "verifying" ? (
            <LoadingBlock text={t(dict, "common.loading")} className="border-0" />
          ) : null}

          {state === "success" ? (
            <>
              <Alert tone="success" role="status">
                {t(dict, "auth.verifyEmailDone")}
              </Alert>
              <ButtonLink href={`/${locale}/account`} className="w-full">
                {t(dict, "nav.account")}
              </ButtonLink>
            </>
          ) : null}

          {state === "error" ? (
            <>
              <Alert tone="danger" role="alert" title={t(dict, "auth.verifyEmailTitle")}>
                {fieldError ?? message ?? t(dict, "common.error")}
              </Alert>

              {resendState === "sent" ? (
                <Alert tone="success" role="status">
                  {t(dict, "auth.verificationSent")}
                </Alert>
              ) : currentUser ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={resendState === "sending"}
                  onClick={onResend}
                >
                  {t(dict, "auth.verifyEmailResend")}
                </Button>
              ) : (
                <ButtonLink href={`/${locale}/login`} variant="secondary" className="w-full">
                  {t(dict, "auth.signIn")}
                </ButtonLink>
              )}

              <p className="text-sm text-rocky-600">
                <Link
                  href={`/${locale}/password-forgot`}
                  className="text-water-700 underline underline-offset-2 hover:text-water-800"
                >
                  {t(dict, "auth.forgotPassword")}
                </Link>
              </p>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
