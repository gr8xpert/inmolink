"use client";

import type { adminFeatureSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptAiIconAction,
  createFeatureAction,
  createGroupAction,
  deleteFeatureAction,
  deleteGroupAction,
  reorderFeatureAction,
  reorderGroupAction,
  suggestIconAction,
  updateFeatureAction,
  updateGroupAction,
} from "./actions";

/**
 * Super-admin curation UI for FeatureGroup + Feature. Mirror of admin/
 * property-types but simpler — no slug field, Lucide icons only.
 */

const LOCALES = ["en", "es", "de", "fr"] as const;
type Locale = (typeof LOCALES)[number];

type Group = adminFeatureSchemas.AdminFeatureGroup;
type Feature = adminFeatureSchemas.AdminFeature;
type GroupSubmit = adminFeatureSchemas.AdminFeatureGroupUpdate;
type FeatureSubmit = adminFeatureSchemas.AdminFeatureUpdate;

function emptyTranslations(): Record<Locale, { name: string }> {
  return { en: { name: "" }, es: { name: "" }, de: { name: "" }, fr: { name: "" } };
}

function loadTranslations(
  rows: ReadonlyArray<{ locale: string; name: string }>,
): Record<Locale, { name: string }> {
  const out = emptyTranslations();
  for (const r of rows) {
    if ((LOCALES as readonly string[]).includes(r.locale)) {
      out[r.locale as Locale] = { name: r.name };
    }
  }
  return out;
}

function trimTranslations(blocks: Record<Locale, { name: string }>) {
  const out: Array<{ locale: Locale; name: string }> = [];
  for (const loc of LOCALES) {
    const name = blocks[loc].name.trim();
    if (loc === "en") {
      if (!name) throw new Error("English name is required");
      out.push({ locale: loc, name });
    } else if (name) {
      out.push({ locale: loc, name });
    }
  }
  return out;
}

type Props = {
  locale: string;
  groups: Group[];
  features: Feature[];
};

export function AdminFeatures({ locale, groups, features }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingFeatureFor, setCreatingFeatureFor] = useState<string | null>(null);

  function withRefresh<A extends unknown[]>(
    fn: (...args: A) => Promise<{ ok: boolean; error?: string }>,
  ) {
    return (...args: A) => {
      setError(null);
      startTransition(async () => {
        try {
          const res = await fn(...args);
          if (res.ok) {
            router.refresh();
            setEditingGroup(null);
            setEditingFeature(null);
            setCreatingGroup(false);
            setCreatingFeatureFor(null);
          } else {
            setError(res.error ?? "Update failed");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Update failed");
        }
      });
    };
  }

  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  const featuresByGroup = new Map<string, Feature[]>();
  for (const f of features) {
    const arr = featuresByGroup.get(f.groupId) ?? [];
    arr.push(f);
    featuresByGroup.set(f.groupId, arr);
  }
  for (const list of featuresByGroup.values()) list.sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Groups</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => setCreatingGroup((v) => !v)}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {creatingGroup ? "Cancel" : "+ New group"}
        </button>
      </div>

      {creatingGroup && (
        <GroupForm
          submitLabel="Create group"
          pending={pending}
          onCancel={() => setCreatingGroup(false)}
          onSubmit={withRefresh((body: GroupSubmit) =>
            createGroupAction(locale, body as adminFeatureSchemas.AdminFeatureGroupCreate),
          )}
        />
      )}

      <ul className="space-y-3">
        {sortedGroups.map((g, idx) => {
          const enName = g.translations.find((t) => t.locale === "en")?.name ?? "(no en)";
          const isEditing = editingGroup === g.id;
          const groupFeatures = featuresByGroup.get(g.id) ?? [];

          return (
            <li key={g.id} className="rounded-md border bg-background">
              {isEditing ? (
                <div className="p-4">
                  <GroupForm
                    initial={g}
                    submitLabel="Save group"
                    pending={pending}
                    onCancel={() => setEditingGroup(null)}
                    onSubmit={withRefresh((body: GroupSubmit) =>
                      updateGroupAction(locale, g.id, body),
                    )}
                  />
                </div>
              ) : (
                <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      pos {g.position}
                    </span>
                    <h3 className="font-semibold">{enName}</h3>
                    {!g.isActive && (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">Inactive</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={pending || idx === 0}
                      onClick={withRefresh(() => reorderGroupAction(locale, g.id, g.position - 1))}
                      aria-label="Move up"
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={pending || idx === sortedGroups.length - 1}
                      onClick={withRefresh(() => reorderGroupAction(locale, g.id, g.position + 1))}
                      aria-label="Move down"
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setEditingGroup(g.id)}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (window.confirm(`Delete group "${enName}"?`)) {
                          withRefresh(() => deleteGroupAction(locale, g.id))();
                        }
                      }}
                      className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </header>
              )}

              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Features ({groupFeatures.length})
                  </h4>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setCreatingFeatureFor((v) => (v === g.id ? null : g.id))}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    {creatingFeatureFor === g.id ? "Cancel" : "+ New feature"}
                  </button>
                </div>

                {creatingFeatureFor === g.id && (
                  <FeatureForm
                    groupId={g.id}
                    submitLabel="Create feature"
                    pending={pending}
                    onCancel={() => setCreatingFeatureFor(null)}
                    onSubmit={withRefresh((body: FeatureSubmit) =>
                      createFeatureAction(locale, body as adminFeatureSchemas.AdminFeatureCreate),
                    )}
                    onSuggestIcon={async (name) => {
                      const r = await suggestIconAction(name, "Feature (amenity)");
                      return r.ok ? r.data.iconName : null;
                    }}
                  />
                )}

                <ul className="space-y-2">
                  {groupFeatures.map((f, fi) => (
                    <FeatureRow
                      key={f.id}
                      feature={f}
                      idx={fi}
                      siblingCount={groupFeatures.length}
                      pending={pending}
                      isEditing={editingFeature === f.id}
                      onEditStart={() => setEditingFeature(f.id)}
                      onEditCancel={() => setEditingFeature(null)}
                      onUpdate={withRefresh((body: FeatureSubmit) =>
                        updateFeatureAction(locale, f.id, body),
                      )}
                      onDelete={() => {
                        const en = f.translations.find((x) => x.locale === "en")?.name ?? f.id;
                        if (window.confirm(`Delete feature "${en}"?`)) {
                          withRefresh(() => deleteFeatureAction(locale, f.id))();
                        }
                      }}
                      onMove={(dir) =>
                        withRefresh(() => reorderFeatureAction(locale, f.id, f.position + dir))()
                      }
                      onSuggestIcon={async (name) => {
                        const r = await suggestIconAction(name, "Feature (amenity)");
                        return r.ok ? r.data.iconName : null;
                      }}
                      onAcceptAiIcon={(iconName) =>
                        withRefresh(() => acceptAiIconAction(locale, f.id, iconName))()
                      }
                    />
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── GroupForm ───────────────────────────────────────────────────────────

function GroupForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: Group;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: GroupSubmit) => void;
}) {
  const [translations, setTranslations] = useState(loadTranslations(initial?.translations ?? []));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [activeTab, setActiveTab] = useState<Locale>("en");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      onSubmit({ translations: trimTranslations(translations), isActive });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Validation error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border bg-muted/20 p-3">
      {localError && (
        <p role="alert" className="text-xs text-red-700">
          {localError}
        </p>
      )}
      <LocaleTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      {LOCALES.map((loc) => (
        <div key={loc} hidden={activeTab !== loc}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Name ({loc})</span>
            <input
              className="input"
              value={translations[loc].name}
              onChange={(e) => setTranslations((t) => ({ ...t, [loc]: { name: e.target.value } }))}
            />
          </label>
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Active</span>
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ─── FeatureRow + FeatureForm ───────────────────────────────────────────

function FeatureRow({
  feature,
  idx,
  siblingCount,
  pending,
  isEditing,
  onEditStart,
  onEditCancel,
  onUpdate,
  onDelete,
  onMove,
  onSuggestIcon,
  onAcceptAiIcon,
}: {
  feature: Feature;
  idx: number;
  siblingCount: number;
  pending: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onUpdate: (body: FeatureSubmit) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onSuggestIcon: (name: string) => Promise<string | null>;
  onAcceptAiIcon: (iconName: string) => void;
}) {
  const en = feature.translations.find((t) => t.locale === "en")?.name ?? feature.id.slice(0, 8);

  if (isEditing) {
    return (
      <li className="rounded-md border bg-muted/10 p-3">
        <FeatureForm
          groupId={feature.groupId}
          initial={feature}
          submitLabel="Save feature"
          pending={pending}
          onCancel={onEditCancel}
          onSubmit={(body) => onUpdate(body)}
          onSuggestIcon={onSuggestIcon}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">pos {feature.position}</span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
          {feature.iconName ?? "(no icon)"}
        </span>
        <span className="truncate font-medium">{en}</span>
        {!feature.isActive && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">Inactive</span>
        )}
        {feature.iconAiSuggestedAt && !feature.iconAdminOverrode && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
            AI
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const suggestion = await onSuggestIcon(en);
            if (!suggestion) {
              alert("No icon suggestion available.");
              return;
            }
            if (window.confirm(`AI suggests "${suggestion}". Accept?`)) {
              onAcceptAiIcon(suggestion);
            }
          }}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          Suggest icon
        </button>
        <button
          type="button"
          disabled={pending || idx === 0}
          onClick={() => onMove(-1)}
          aria-label="Move up"
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={pending || idx === siblingCount - 1}
          onClick={() => onMove(1)}
          aria-label="Move down"
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          ↓
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onEditStart}
          className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function FeatureForm({
  groupId,
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
  onSuggestIcon,
}: {
  groupId: string;
  initial?: Feature;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: FeatureSubmit) => void;
  onSuggestIcon: (name: string) => Promise<string | null>;
}) {
  const [translations, setTranslations] = useState(loadTranslations(initial?.translations ?? []));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [iconName, setIconName] = useState<string>(initial?.iconName ?? "");
  const [activeTab, setActiveTab] = useState<Locale>("en");
  const [localError, setLocalError] = useState<string | null>(null);

  async function suggest() {
    setLocalError(null);
    const en = translations.en.name.trim();
    if (!en) {
      setLocalError("Set the English name first so the AI has something to work from.");
      return;
    }
    const s = await onSuggestIcon(en);
    if (s) setIconName(s);
    else setLocalError("AI returned no suggestion.");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      onSubmit({
        groupId,
        translations: trimTranslations(translations),
        isActive,
        iconName: iconName.trim() || null,
      });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Validation error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {localError && (
        <p role="alert" className="text-xs text-red-700">
          {localError}
        </p>
      )}
      <LocaleTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      {LOCALES.map((loc) => (
        <div key={loc} hidden={activeTab !== loc}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Name ({loc})</span>
            <input
              className="input"
              value={translations[loc].name}
              onChange={(e) => setTranslations((t) => ({ ...t, [loc]: { name: e.target.value } }))}
            />
          </label>
        </div>
      ))}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-muted-foreground">
            Lucide icon name (kebab-case)
          </span>
          <div className="flex gap-2">
            <input
              className="input"
              value={iconName}
              onChange={(e) => setIconName(e.target.value)}
              placeholder="e.g. waves or bath"
            />
            <button
              type="button"
              onClick={suggest}
              disabled={pending}
              className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              Suggest
            </button>
          </div>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span>Active</span>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function LocaleTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: Locale;
  setActiveTab: (l: Locale) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b">
      {LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          role="tab"
          aria-selected={activeTab === loc}
          onClick={() => setActiveTab(loc)}
          className={`px-3 py-1 text-xs font-medium ${
            activeTab === loc
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {loc.toUpperCase()}
          {loc === "en" && <span className="ml-1 text-red-500">*</span>}
        </button>
      ))}
    </div>
  );
}
