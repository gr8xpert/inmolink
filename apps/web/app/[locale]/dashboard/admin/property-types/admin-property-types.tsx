"use client";

import type { adminPropertyTypeSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptAiIconAction,
  createGroupAction,
  createTypeAction,
  deleteGroupAction,
  deleteTypeAction,
  reorderGroupAction,
  reorderTypeAction,
  suggestIconAction,
  updateGroupAction,
  updateTypeAction,
} from "./actions";

/**
 * Super-admin curation UI for PropertyTypeGroup + PropertyType.
 *
 * Layout: each group is a fieldset that expands to show its types.
 * Editing happens inline — click "Edit" on a row and the row swaps into
 * a form. "Save" calls a server action; cancel discards.
 *
 * Translation editor: en is required; es/de/fr are optional and dropped
 * on submit if name is blank. Slug is required when name is set.
 *
 * Icon: Lucide library names only on this surface (custom SVG upload
 * lands in a follow-up). The "Suggest" button calls Claude Haiku via
 * the api; "Accept" writes the suggestion to the type and clears the
 * iconAdminOverrode flag so future suggestions can run if you want.
 */

const LOCALES = ["en", "es", "de", "fr"] as const;
type Locale = (typeof LOCALES)[number];

type Group = adminPropertyTypeSchemas.AdminPropertyTypeGroup;
type Type = adminPropertyTypeSchemas.AdminPropertyType;
type Translation = { locale: Locale; name: string; slug: string };
type GroupSubmit = adminPropertyTypeSchemas.AdminPropertyTypeGroupUpdate;
type TypeSubmit = adminPropertyTypeSchemas.AdminPropertyTypeUpdate;

const slugRe = /^[a-z0-9-]+$/;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

function emptyTranslations(): Record<Locale, { name: string; slug: string }> {
  return {
    en: { name: "", slug: "" },
    es: { name: "", slug: "" },
    de: { name: "", slug: "" },
    fr: { name: "", slug: "" },
  };
}

function loadTranslations(
  rows: ReadonlyArray<{ locale: string; name: string; slug: string }>,
): Record<Locale, { name: string; slug: string }> {
  const out = emptyTranslations();
  for (const r of rows) {
    if ((LOCALES as readonly string[]).includes(r.locale)) {
      out[r.locale as Locale] = { name: r.name, slug: r.slug };
    }
  }
  return out;
}

function trimTranslations(
  blocks: Record<Locale, { name: string; slug: string }>,
  requireSlug: boolean,
): Translation[] {
  const out: Translation[] = [];
  for (const loc of LOCALES) {
    const b = blocks[loc];
    const name = b.name.trim();
    const slug = b.slug.trim() || (name ? slugify(name) : "");
    if (loc === "en") {
      if (!name) throw new Error("English name is required");
      if (requireSlug && (!slug || !slugRe.test(slug)))
        throw new Error("English slug must be lowercase a-z, 0-9, dashes");
      out.push({ locale: loc, name, slug });
    } else if (name) {
      if (requireSlug && !slugRe.test(slug)) throw new Error(`${loc.toUpperCase()} slug invalid`);
      out.push({ locale: loc, name, slug });
    }
  }
  return out;
}

type Props = {
  locale: string;
  groups: Group[];
  types: Type[];
};

export function AdminPropertyTypes({ locale, groups, types }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [creatingTypeFor, setCreatingTypeFor] = useState<string | null>(null);

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
            setEditingType(null);
            setCreatingGroup(false);
            setCreatingTypeFor(null);
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
  const typesByGroup = new Map<string, Type[]>();
  for (const t of types) {
    const arr = typesByGroup.get(t.groupId) ?? [];
    arr.push(t);
    typesByGroup.set(t.groupId, arr);
  }
  for (const list of typesByGroup.values()) list.sort((a, b) => a.position - b.position);

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
            createGroupAction(
              locale,
              body as adminPropertyTypeSchemas.AdminPropertyTypeGroupCreate,
            ),
          )}
        />
      )}

      <ul className="space-y-3">
        {sortedGroups.map((g, idx) => {
          const enName = g.translations.find((t) => t.locale === "en")?.name ?? "(no en)";
          const isEditing = editingGroup === g.id;
          const groupTypes = typesByGroup.get(g.id) ?? [];

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
                    Types ({groupTypes.length})
                  </h4>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setCreatingTypeFor((v) => (v === g.id ? null : g.id))}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    {creatingTypeFor === g.id ? "Cancel" : "+ New type"}
                  </button>
                </div>

                {creatingTypeFor === g.id && (
                  <TypeForm
                    groupId={g.id}
                    submitLabel="Create type"
                    pending={pending}
                    onCancel={() => setCreatingTypeFor(null)}
                    onSubmit={withRefresh((body: TypeSubmit) =>
                      createTypeAction(
                        locale,
                        body as adminPropertyTypeSchemas.AdminPropertyTypeCreate,
                      ),
                    )}
                    onSuggestIcon={async (name) => {
                      const r = await suggestIconAction(name, "PropertyType");
                      return r.ok ? r.data.iconName : null;
                    }}
                  />
                )}

                <ul className="space-y-2">
                  {groupTypes.map((t, ti) => (
                    <TypeRow
                      key={t.id}
                      type={t}
                      idx={ti}
                      siblingCount={groupTypes.length}
                      pending={pending}
                      isEditing={editingType === t.id}
                      onEditStart={() => setEditingType(t.id)}
                      onEditCancel={() => setEditingType(null)}
                      onUpdate={withRefresh((body: TypeSubmit) =>
                        updateTypeAction(locale, t.id, body),
                      )}
                      onDelete={() => {
                        const en = t.translations.find((x) => x.locale === "en")?.name ?? t.id;
                        if (window.confirm(`Delete type "${en}"?`)) {
                          withRefresh(() => deleteTypeAction(locale, t.id))();
                        }
                      }}
                      onMove={(dir) =>
                        withRefresh(() => reorderTypeAction(locale, t.id, t.position + dir))()
                      }
                      onSuggestIcon={async (name) => {
                        const r = await suggestIconAction(name, "PropertyType");
                        return r.ok ? r.data.iconName : null;
                      }}
                      onAcceptAiIcon={(iconName) =>
                        withRefresh(() => acceptAiIconAction(locale, t.id, iconName))()
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
      const trs = trimTranslations(translations, true);
      onSubmit({ translations: trs, isActive });
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
        <div key={loc} hidden={activeTab !== loc} className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Name</span>
            <input
              className="input"
              value={translations[loc].name}
              onChange={(e) =>
                setTranslations((t) => ({
                  ...t,
                  [loc]: {
                    name: e.target.value,
                    // Auto-slug only if slug is blank.
                    slug: t[loc].slug || slugify(e.target.value),
                  },
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Slug</span>
            <input
              className="input"
              value={translations[loc].slug}
              onChange={(e) =>
                setTranslations((t) => ({ ...t, [loc]: { ...t[loc], slug: e.target.value } }))
              }
            />
          </label>
        </div>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>Active (shown to agents in pickers)</span>
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

// ─── TypeRow + TypeForm ──────────────────────────────────────────────────

function TypeRow({
  type,
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
  type: Type;
  idx: number;
  siblingCount: number;
  pending: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onUpdate: (body: TypeSubmit) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onSuggestIcon: (name: string) => Promise<string | null>;
  onAcceptAiIcon: (iconName: string) => void;
}) {
  const en = type.translations.find((t) => t.locale === "en")?.name ?? type.id.slice(0, 8);

  if (isEditing) {
    return (
      <li className="rounded-md border bg-muted/10 p-3">
        <TypeForm
          groupId={type.groupId}
          initial={type}
          submitLabel="Save type"
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
        <span className="font-mono text-xs text-muted-foreground">pos {type.position}</span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
          {type.iconName ?? "(no icon)"}
        </span>
        <span className="truncate font-medium">{en}</span>
        {!type.isActive && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">Inactive</span>
        )}
        {type.iconAiSuggestedAt && !type.iconAdminOverrode && (
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

function TypeForm({
  groupId,
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
  onSuggestIcon,
}: {
  groupId: string;
  initial?: Type;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: TypeSubmit) => void;
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
      const trs = trimTranslations(translations, true);
      onSubmit({
        groupId,
        translations: trs,
        isActive,
        iconKind: "LIBRARY",
        iconName: iconName.trim() || null,
        iconR2Key: null,
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
        <div key={loc} hidden={activeTab !== loc} className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Name</span>
            <input
              className="input"
              value={translations[loc].name}
              onChange={(e) =>
                setTranslations((t) => ({
                  ...t,
                  [loc]: { name: e.target.value, slug: t[loc].slug || slugify(e.target.value) },
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Slug</span>
            <input
              className="input"
              value={translations[loc].slug}
              onChange={(e) =>
                setTranslations((t) => ({ ...t, [loc]: { ...t[loc], slug: e.target.value } }))
              }
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
              placeholder="e.g. building-2 or home"
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
