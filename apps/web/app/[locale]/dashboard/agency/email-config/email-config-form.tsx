"use client";

import type { marketingSchemas } from "@inmolink/shared";
import { useActionState } from "react";
import { rotateDkimAction, saveEmailConfigAction, testSendAction } from "./actions";

type Props = {
  locale: string;
  initial: marketingSchemas.EmailConfigOutput | null;
  userEmail: string | null;
};

export function EmailConfigForm({ locale, initial, userEmail }: Props) {
  const [saveState, saveAction, savePending] = useActionState(saveEmailConfigAction, null);
  const [testState, testAction, testPending] = useActionState(testSendAction, null);
  const [rotateState, rotateAction, rotatePending] = useActionState(
    async () => rotateDkimAction(),
    null,
  );

  return (
    <div className="space-y-6">
      <form action={saveAction} className="space-y-3 rounded-md border bg-background p-4 shadow-sm">
        <input type="hidden" name="locale" value={locale} />
        <h2 className="font-semibold">SMTP credentials</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Host
            <input
              name="smtpHost"
              required
              defaultValue={initial?.smtpHost ?? ""}
              className="input mt-1 w-full"
              placeholder="smtp.example.com"
            />
          </label>
          <label className="text-xs">
            Port
            <input
              name="smtpPort"
              type="number"
              required
              defaultValue={initial?.smtpPort ?? 587}
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs">
            User
            <input
              name="smtpUser"
              required
              defaultValue={initial?.smtpUser ?? ""}
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs">
            Password
            <input
              name="smtpPassword"
              type="password"
              placeholder={initial?.hasPassword ? "(unchanged)" : ""}
              className="input mt-1 w-full"
              autoComplete="new-password"
            />
          </label>
          <label className="text-xs">
            From email
            <input
              name="fromEmail"
              type="email"
              required
              defaultValue={initial?.fromEmail ?? ""}
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs">
            From name
            <input
              name="fromName"
              required
              defaultValue={initial?.fromName ?? ""}
              className="input mt-1 w-full"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" name="smtpSecure" defaultChecked={initial?.smtpSecure ?? false} />
          Use TLS (port 465 implies TLS automatically)
        </label>

        <h2 className="font-semibold">DKIM (optional)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            DKIM domain
            <input
              name="dkimDomain"
              defaultValue={initial?.dkimDomain ?? ""}
              placeholder="example.com"
              className="input mt-1 w-full"
            />
          </label>
          <label className="text-xs">
            DKIM selector
            <input
              name="dkimSelector"
              defaultValue={initial?.dkimSelector ?? "inmolink"}
              className="input mt-1 w-full"
            />
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savePending}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90 disabled:opacity-50"
          >
            {savePending ? "…" : "Save"}
          </button>
          {saveState?.error && <p className="text-xs text-red-700">{saveState.error}</p>}
          {saveState?.ok && <p className="text-xs text-emerald-700">Saved.</p>}
        </div>
      </form>

      <form action={testAction} className="space-y-2 rounded-md border bg-background p-4 shadow-sm">
        <input type="hidden" name="locale" value={locale} />
        <h2 className="font-semibold">Test send</h2>
        <p className="text-xs text-muted-foreground">
          {initial?.testStatus === "OK"
            ? "Last test: ✓ OK"
            : initial?.testStatus === "FAIL"
              ? "Last test: ✕ FAIL"
              : "Last test: not yet run"}
          {initial?.testedAt && ` · ${new Date(initial.testedAt).toLocaleString(locale)}`}
        </p>
        <div className="flex items-center gap-2">
          <input
            name="to"
            type="email"
            placeholder={userEmail ?? "user@example.com"}
            className="input flex-1"
          />
          <button
            type="submit"
            disabled={testPending}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {testPending ? "…" : "Send test"}
          </button>
        </div>
        {testState?.ok && (
          <p className="text-xs text-emerald-700">
            ✓ Sent {testState.messageId && <>· id {testState.messageId}</>}
          </p>
        )}
        {testState && !testState.ok && testState.error && (
          <p className="text-xs text-red-700">{testState.error}</p>
        )}
      </form>

      <form
        action={rotateAction}
        className="space-y-2 rounded-md border bg-background p-4 shadow-sm"
      >
        <h2 className="font-semibold">DKIM keypair</h2>
        <p className="text-xs text-muted-foreground">
          Generate a fresh 2048-bit RSA keypair. The public key is shown once — copy it into your
          DNS provider as a TXT record.
        </p>
        <button
          type="submit"
          disabled={rotatePending}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          {rotatePending ? "…" : "Rotate DKIM key"}
        </button>
        {rotateState?.error && (
          <p className="break-all text-xs text-emerald-700">{rotateState.error}</p>
        )}
      </form>
    </div>
  );
}
