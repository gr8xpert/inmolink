"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { disableTwoFactorAction, startEnrollAction, verifyEnrollAction } from "./actions";

type Props = { locale: string; enabled: boolean };

type Phase =
  | { kind: "idle" }
  | { kind: "enrolling"; secret: string; otpauthUrl: string }
  | { kind: "saved"; recoveryCodes: string[] };

export function TwoFactorManager({ locale, enabled: initialEnabled }: Props) {
  const t = useTranslations("settings.twoFactor");
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");

  function onEnroll() {
    setError(null);
    start(async () => {
      const res = await startEnrollAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhase({ kind: "enrolling", secret: res.data.secret, otpauthUrl: res.data.otpauthUrl });
    });
  }

  function onVerify() {
    setError(null);
    if (phase.kind !== "enrolling") return;
    start(async () => {
      const res = await verifyEnrollAction(locale, { currentPassword: password, code });
      if (!res.ok) {
        setError(res.status === 400 ? t("incorrectCode") : res.error);
        return;
      }
      setEnabled(true);
      setPhase({ kind: "saved", recoveryCodes: res.data.recoveryCodes });
      setCode("");
      setPassword("");
    });
  }

  function onDisable() {
    setError(null);
    start(async () => {
      const res = await disableTwoFactorAction(locale, {
        currentPassword: password,
        ...(code ? { code } : {}),
        ...(recoveryCode ? { recoveryCode } : {}),
      });
      if (!res.ok) {
        setError(res.status === 400 ? t("incorrectCode") : res.error);
        return;
      }
      setEnabled(false);
      setPhase({ kind: "idle" });
      setCode("");
      setPassword("");
      setRecoveryCode("");
    });
  }

  if (enabled && phase.kind === "saved") {
    return <RecoveryCodesPanel codes={phase.recoveryCodes} />;
  }

  if (enabled) {
    return (
      <section className="space-y-4">
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
          {t("enabled")}
        </p>
        <details className="rounded-md border bg-background p-4">
          <summary className="cursor-pointer text-sm font-medium">{t("disable")}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{t("disableHint")}</p>
            <Field label={t("passwordLabel")}>
              <input
                type="password"
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
            </Field>
            <Field label={t("code")}>
              <input
                inputMode="numeric"
                className="input font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
                placeholder="123456"
              />
            </Field>
            <Field label="Recovery code">
              <input
                className="input font-mono"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.currentTarget.value)}
                placeholder="aaaa-bbbb-cccc"
              />
            </Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="button"
              onClick={onDisable}
              disabled={pending || !password || (!code && !recoveryCode)}
              className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {pending ? t("saving") : t("disable")}
            </button>
          </div>
        </details>
      </section>
    );
  }

  if (phase.kind === "enrolling") {
    return (
      <section className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("enrollHint")}</p>
        <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">{t("secret")}</p>
          <code className="block break-all rounded border bg-background p-2 font-mono text-xs">
            {phase.secret}
          </code>
          <p className="text-xs text-muted-foreground">otpauth URL:</p>
          <code className="block break-all rounded border bg-background p-2 font-mono text-xs">
            {phase.otpauthUrl}
          </code>
        </div>
        <Field label={t("passwordLabel")}>
          <input
            type="password"
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
          />
        </Field>
        <Field label={t("code")}>
          <input
            inputMode="numeric"
            className="input font-mono text-lg tracking-widest"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder="123456"
          />
        </Field>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="button"
          onClick={onVerify}
          disabled={pending || code.length !== 6 || !password}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("verifying") : t("verify")}
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <p className="text-sm">{t("disabled")}</p>
      <button
        type="button"
        onClick={onEnroll}
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
      >
        {pending ? t("saving") : t("enroll")}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </section>
  );
}

function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const t = useTranslations("settings.twoFactor");
  return (
    <section className="space-y-4">
      <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
        {t("enabledOk")}
      </p>
      <div className="rounded-md border bg-background p-4">
        <h3 className="text-sm font-medium">{t("recoveryCodes")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("recoveryHint")}</p>
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {codes.map((c) => (
            <li
              key={c}
              className="rounded border bg-muted/30 px-2 py-1 font-mono text-sm tracking-wide"
            >
              {c}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input passed via children — implicit HTML5 association still works.
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
