import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { ForgotPasswordForm } from "./forgot-form";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/password-forgot",
    title: dict.auth.forgotTitle,
    description: dict.auth.forgotBody,
    noIndex: true,
  });
}

export default async function PasswordForgotPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return <ForgotPasswordForm locale={locale} />;
}
