"use client";

import { useActionState } from "react";
import { createEndpointAction } from "./actions";

const ALL_EVENT_TYPES = [
  "PROPERTY_CREATED",
  "PROPERTY_UPDATED",
  "PROPERTY_DELETED",
  "LEAD_CREATED",
  "VIEWING_REQUESTED",
  "VIEWING_ACCEPTED",
  "VIEWING_DECLINED",
  "VIEWING_COMPLETED",
  "DEAL_CONFIRMED",
  "DEAL_DISPUTED",
  "AGENT_INVITED",
  "AGENT_JOINED",
  "IMPORT_RUN_COMPLETED",
  "IMPORT_RUN_FAILED",
  "CHAT_MESSAGE_RECEIVED",
] as const;

export function CreateEndpointForm({ locale }: { locale: string }) {
  const [state, action, pending] = useActionState(createEndpointAction, null);
  return (
    <form action={action} className="mt-3 space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <label className="block text-xs">
        URL *
        <input
          name="url"
          type="url"
          required
          placeholder="https://example.com/inmolink-hooks"
          className="input mt-1 w-full"
        />
      </label>
      <label className="block text-xs">
        Description (optional)
        <input
          name="description"
          maxLength={255}
          className="input mt-1 w-full"
          placeholder="What this endpoint is for"
        />
      </label>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide">Events *</p>
        <div className="grid gap-1 sm:grid-cols-3">
          {ALL_EVENT_TYPES.map((e) => (
            <label key={e} className="flex items-center gap-2 text-xs">
              <input type="checkbox" name={`event:${e}`} />
              {e}
            </label>
          ))}
        </div>
      </div>
      <label className="block text-xs">
        Custom secret (optional — auto-generated if blank)
        <input
          name="secret"
          minLength={16}
          maxLength={128}
          className="input mt-1 w-full"
          placeholder="Min 16 chars"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create endpoint"}
      </button>
      {state?.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state?.ok && state.secret && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
          <p className="font-semibold text-emerald-900">Endpoint created.</p>
          <p className="mt-1 text-emerald-900">Secret (save this — it&apos;s shown only once):</p>
          <code className="mt-1 block break-all rounded bg-white p-2 font-mono text-[10px]">
            {state.secret}
          </code>
        </div>
      )}
    </form>
  );
}
