"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { isLocale, localeNames, type Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { PasswordInput } from "@/components/auth/password-input";
import { fieldErrors, formError, useRequireAuth } from "@/components/auth/helpers";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

export function ProfileView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { user, ready } = useRequireAuth(locale);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<Locale>(locale);
  const [profileErrors, setProfileErrors] = useState<Record<string, string | undefined>>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string | undefined>>({});
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? "");
    if (isLocale(user.locale)) setPreferredLocale(user.locale);
  }, [user]);

  async function onSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    setProfileErrors({});
    setProfileError(null);
    setProfileSaved(false);

    try {
      await apiFetch("/api/v1/account/profile", {
        method: "PATCH",
        body: {
          name: name.trim(),
          phone: phone.trim(),
          locale: preferredLocale,
        },
      });
      setProfileSaved(true);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError && Object.keys(error.details ?? {}).length > 0) {
        setProfileErrors(fieldErrors(error));
      }
      setProfileError(formError(error, dict));
    } finally {
      setSavingProfile(false);
    }
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPassword) return;
    setPasswordErrors({});
    setPasswordError(null);
    setPasswordSaved(false);

    if (newPassword !== confirmPassword) {
      setPasswordErrors({ confirmPassword: t(dict, "common.error") });
      return;
    }

    setSavingPassword(true);
    try {
      await apiFetch("/api/v1/auth/password-change", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      if (error instanceof ApiClientError && Object.keys(error.details ?? {}).length > 0) {
        setPasswordErrors(fieldErrors(error));
      }
      setPasswordError(formError(error, dict));
    } finally {
      setSavingPassword(false);
    }
  }

  if (!ready || !user) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "account.profile")}
          description={user.email}
        />
        <CardBody>
          {profileSaved ? (
            <div className="mb-4">
              <Alert tone="success" role="status">
                {t(dict, "account.saved")}
              </Alert>
            </div>
          ) : null}
          {profileError ? (
            <div className="mb-4">
              <Alert tone="danger" role="alert">
                {profileError}
              </Alert>
            </div>
          ) : null}

          <form onSubmit={onSaveProfile} noValidate className="space-y-4">
            <Field
              label={t(dict, "auth.name")}
              htmlFor="profile-name"
              hint={t(dict, "common.optional")}
              error={profileErrors.name}
            >
              <Input
                id="profile-name"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={savingProfile}
              />
            </Field>

            <Field
              label={t(dict, "auth.phone")}
              htmlFor="profile-phone"
              hint={t(dict, "common.optional")}
              error={profileErrors.phone}
            >
              <Input
                id="profile-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={savingProfile}
              />
            </Field>

            <Field label={t(dict, "nav.language")} htmlFor="profile-locale" error={profileErrors.locale}>
              <Select
                id="profile-locale"
                name="locale"
                value={preferredLocale}
                onChange={(e) => setPreferredLocale(e.target.value as Locale)}
                disabled={savingProfile}
              >
                {(Object.keys(localeNames) as Locale[]).map((code) => (
                  <option key={code} value={code}>
                    {localeNames[code]}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="flex justify-end">
              <Button type="submit" loading={savingProfile}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "account.changePassword")} description={t(dict, "account.security")} />
        <CardBody>
          {passwordSaved ? (
            <div className="mb-4">
              <Alert tone="success" role="status">
                {t(dict, "account.passwordChanged")}
              </Alert>
            </div>
          ) : null}
          {passwordError ? (
            <div className="mb-4">
              <Alert tone="danger" role="alert">
                {passwordError}
              </Alert>
            </div>
          ) : null}

          <form onSubmit={onChangePassword} noValidate className="space-y-4">
            <Field
              label={t(dict, "account.currentPassword")}
              htmlFor="password-current"
              required
              error={passwordErrors.currentPassword}
            >
              <PasswordInput
                dict={dict}
                id="password-current"
                name="currentPassword"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={savingPassword}
              />
            </Field>

            <Field
              label={t(dict, "account.newPassword")}
              htmlFor="password-new"
              required
              error={passwordErrors.newPassword}
            >
              <PasswordInput
                dict={dict}
                id="password-new"
                name="newPassword"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={savingPassword}
              />
            </Field>

            <Field
              label={t(dict, "auth.confirmPassword")}
              htmlFor="password-confirm"
              required
              error={passwordErrors.confirmPassword ?? passwordErrors.confirm}
            >
              <PasswordInput
                dict={dict}
                id="password-confirm"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" variant="secondary" loading={savingPassword}>
                {t(dict, "account.changePassword")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
