"use client";

import { type feedConnectionSchemas, feedConnectionSchemas as schemas } from "@inmolink/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { createConnectionAction, updateConnectionAction } from "./actions";

type Props =
  | { locale: string; mode: "create" }
  | { locale: string; mode: "edit"; initial: feedConnectionSchemas.FeedConnection };

type FormValues = {
  kind: "KYERO" | "RESALE_ONLINE" | "GENERIC_XML";
  feedUrl: string;
  cronSchedule: string;
  syncEnabled: boolean;
  // GENERIC_XML mapping editor — JSON pasted in for v1; full visual builder
  // is a follow-up. Empty string in the textarea means "no mappings configured".
  fieldMappingsJson: string;
};

export function ImportForm(props: Props) {
  const t = useTranslations("imports");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const initialValues: FormValues =
    props.mode === "edit"
      ? {
          kind: props.initial.kind,
          feedUrl: props.initial.feedUrl,
          cronSchedule: props.initial.cronSchedule,
          syncEnabled: props.initial.syncEnabled,
          fieldMappingsJson: props.initial.fieldMappings
            ? JSON.stringify(props.initial.fieldMappings, null, 2)
            : "",
        }
      : {
          kind: "KYERO",
          feedUrl: "",
          cronSchedule: "0 */6 * * *",
          syncEnabled: true,
          fieldMappingsJson: "",
        };

  const { register, handleSubmit, watch, formState } = useForm<FormValues>({
    defaultValues: initialValues,
  });
  const kind = watch("kind");

  function onSubmit(v: FormValues) {
    setError(null);
    let fieldMappings: feedConnectionSchemas.FeedConnection["fieldMappings"] | undefined;
    if (v.kind === "GENERIC_XML") {
      if (!v.fieldMappingsJson.trim()) {
        setError(t("create.fieldMappingsRequired"));
        return;
      }
      try {
        const raw = JSON.parse(v.fieldMappingsJson);
        // Re-validate against the strict schema before sending. Surfaces a
        // friendly error in the UI instead of an opaque 422 from the api.
        const parsed = schemas.feedConnectionCreateSchema.shape.fieldMappings.safeParse(raw);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? t("create.invalidMappings"));
          return;
        }
        fieldMappings = parsed.data ?? undefined;
      } catch {
        setError(t("create.invalidJson"));
        return;
      }
    }

    start(async () => {
      if (props.mode === "create") {
        const payload: feedConnectionSchemas.FeedConnectionCreate = {
          kind: v.kind,
          feedUrl: v.feedUrl,
          cronSchedule: v.cronSchedule,
          syncEnabled: v.syncEnabled,
          fieldMappings: fieldMappings ?? null,
        };
        const r = await createConnectionAction(props.locale, payload);
        if (r.ok) router.push(`/${props.locale}/dashboard/imports/${r.data.id}`);
        else setError(r.error);
      } else {
        const payload: feedConnectionSchemas.FeedConnectionUpdate = {
          feedUrl: v.feedUrl,
          cronSchedule: v.cronSchedule,
          syncEnabled: v.syncEnabled,
          fieldMappings: fieldMappings ?? null,
        };
        const r = await updateConnectionAction(props.locale, props.initial.id, payload);
        if (r.ok) router.refresh();
        else setError(r.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-md border bg-background p-6 shadow-sm"
    >
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <label className="block text-sm">
        <span className="block font-medium">{t("create.kind")}</span>
        <select
          {...register("kind")}
          disabled={props.mode === "edit"}
          className="input mt-1 w-full"
        >
          <option value="KYERO">Kyero</option>
          <option value="RESALE_ONLINE">Resale Online</option>
          <option value="GENERIC_XML">Generic XML</option>
        </select>
        {props.mode === "edit" && (
          <span className="block text-xs text-muted-foreground mt-1">{t("edit.kindLocked")}</span>
        )}
      </label>

      <label className="block text-sm">
        <span className="block font-medium">{t("create.feedUrl")}</span>
        <input
          {...register("feedUrl", { required: true })}
          type="url"
          className="input mt-1 w-full font-mono"
          placeholder="https://example.com/feed.xml"
        />
        {formState.errors.feedUrl && (
          <span className="block text-xs text-red-600 mt-1">{t("create.feedUrlRequired")}</span>
        )}
      </label>

      <label className="block text-sm">
        <span className="block font-medium">{t("create.cron")}</span>
        <input
          {...register("cronSchedule", { required: true })}
          className="input mt-1 w-full font-mono"
        />
        <span className="block text-xs text-muted-foreground mt-1">{t("create.cronHint")}</span>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("syncEnabled")} />
        <span>{t("create.syncEnabled")}</span>
      </label>

      {kind === "GENERIC_XML" && (
        <label className="block text-sm">
          <span className="block font-medium">{t("create.fieldMappings")}</span>
          <textarea
            {...register("fieldMappingsJson")}
            rows={12}
            className="input mt-1 w-full font-mono text-xs"
            placeholder='{ "itemTag": "listing", "source": "GENERIC_XML", "mappings": [ ... ] }'
          />
          <span className="block text-xs text-muted-foreground mt-1">
            {t("create.fieldMappingsHint")}
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("saving") : t(props.mode === "create" ? "create.submit" : "edit.submit")}
        </button>
      </div>
    </form>
  );
}
