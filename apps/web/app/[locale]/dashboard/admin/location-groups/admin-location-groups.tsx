"use client";

import type { adminLocationGroupSchemas, adminLocationSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addMemberAction,
  createGroupAction,
  deleteGroupAction,
  removeMemberAction,
  reorderGroupAction,
  reorderMemberAction,
  updateGroupAction,
} from "./actions";

/**
 * Super-admin curation UI for LocationGroup. Shows each group as a
 * fieldset with translations + member list. The member picker is a
 * native <select> filtered to locations not already in the group;
 * works fine at the v1 catalog scale (a few hundred locations max).
 * Replace with an autocomplete in 2.D when the catalog grows.
 */

const LOCALES = ["en", "es", "de", "fr"] as const;
type Locale = (typeof LOCALES)[number];

type Group = adminLocationGroupSchemas.AdminLocationGroup;
type GroupSubmit = adminLocationGroupSchemas.AdminLocationGroupUpdate;
type Loc = adminLocationSchemas.AdminLocation;

const slugRe = /^[a-z0-9-]+$/;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

type TBlock = { name: string; slug: string; metaTitle: string; metaDescription: string };

function emptyTranslations(): Record<Locale, TBlock> {
  const e = (): TBlock => ({ name: "", slug: "", metaTitle: "", metaDescription: "" });
  return { en: e(), es: e(), de: e(), fr: e() };
}

function loadTranslations(
  rows: ReadonlyArray<{
    locale: string;
    name: string;
    slug: string;
    metaTitle: string | null;
    metaDescription: string | null;
  }>,
): Record<Locale, TBlock> {
  const out = emptyTranslations();
  for (const r of rows) {
    if ((LOCALES as readonly string[]).includes(r.locale)) {
      out[r.locale as Locale] = {
        name: r.name,
        slug: r.slug,
        metaTitle: r.metaTitle ?? "",
        metaDescription: r.metaDescription ?? "",
      };
    }
  }
  return out;
}

function trimTranslations(blocks: Record<Locale, TBlock>) {
  const out: Array<{
    locale: Locale;
    name: string;
    slug: string;
    metaTitle?: string | null;
    metaDescription?: string | null;
  }> = [];
  for (const loc of LOCALES) {
    const b = blocks[loc];
    const name = b.name.trim();
    const slug = b.slug.trim() || (name ? slugify(name) : "");
    if (loc === "en") {
      if (!name) throw new Error("English name is required");
      if (!slug || !slugRe.test(slug))
        throw new Error("English slug must be lowercase a-z, 0-9, dashes");
      out.push({
        locale: loc,
        name,
        slug,
        metaTitle: b.metaTitle.trim() || null,
        metaDescription: b.metaDescription.trim() || null,
      });
    } else if (name) {
      if (!slug || !slugRe.test(slug))
        throw new Error(`${loc.toUpperCase()} slug must be lowercase a-z, 0-9, dashes`);
      out.push({
        locale: loc,
        name,
        slug,
        metaTitle: b.metaTitle.trim() || null,
        metaDescription: b.metaDescription.trim() || null,
      });
    }
  }
  return out;
}

function locationDisplayName(loc: Loc): string {
  const en = loc.translations.find((t) => t.locale === "en")?.name;
  return en ?? loc.translations[0]?.name ?? loc.id.slice(0, 8);
}

type Props = {
  locale: string;
  groups: Group[];
  allLocations: Loc[];
};

export function AdminLocationGroups({ locale, groups, allLocations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

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
            setCreatingGroup(false);
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
  const sortedLocations = [...allLocations].sort((a, b) => {
    if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode);
    if (a.level !== b.level) return a.level.localeCompare(b.level);
    return locationDisplayName(a).localeCompare(locationDisplayName(b));
  });

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
            createGroupAction(locale, body as adminLocationGroupSchemas.AdminLocationGroupCreate),
          )}
        />
      )}

      <ul className="space-y-3">
        {sortedGroups.map((g, idx) => {
          const enName = g.translations.find((t) => t.locale === "en")?.name ?? "(no en)";
          const isEditing = editingGroup === g.id;
          const memberIds = new Set(g.members.map((m) => m.locationId));

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
                    <span className="text-xs text-muted-foreground">
                      {g.members.length} member{g.members.length === 1 ? "" : "s"}
                    </span>
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
                        if (
                          window.confirm(
                            `Delete group "${enName}"? Members will be removed (cascade).`,
                          )
                        ) {
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
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Members
                </h4>

                {g.members.length === 0 && (
                  <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    No locations in this group yet.
                  </p>
                )}

                <ul className="space-y-1">
                  {g.members.map((m, mi) => (
                    <li
                      key={m.locationId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
                    >
                      <div className="flex min-w-0 items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">
                          pos {m.position}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                          {m.level}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.countryCode}
                        </span>
                        <span className="truncate font-medium">{m.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={pending || mi === 0}
                          onClick={withRefresh(() =>
                            reorderMemberAction(locale, g.id, m.locationId, m.position - 1),
                          )}
                          aria-label="Move up"
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={pending || mi === g.members.length - 1}
                          onClick={withRefresh(() =>
                            reorderMemberAction(locale, g.id, m.locationId, m.position + 1),
                          )}
                          aria-label="Move down"
                          className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm(`Remove "${m.name}" from this group?`)) {
                              withRefresh(() => removeMemberAction(locale, g.id, m.locationId))();
                            }
                          }}
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <AddMemberForm
                  pending={pending}
                  available={sortedLocations.filter((l) => !memberIds.has(l.id))}
                  onAdd={(locationId) =>
                    withRefresh(() => addMemberAction(locale, g.id, locationId))()
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── AddMemberForm ──────────────────────────────────────────────────────

function AddMemberForm({
  pending,
  available,
  onAdd,
}: {
  pending: boolean;
  available: Loc[];
  onAdd: (locationId: string) => void;
}) {
  const [pick, setPick] = useState<string>("");

  if (available.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        All known locations are already in this group.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-xs uppercase text-muted-foreground">Add location</span>
        <select
          className="input"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          disabled={pending}
        >
          <option value="">— select a location —</option>
          {available.map((l) => (
            <option key={l.id} value={l.id}>
              {l.countryCode} · {l.level} · {locationDisplayName(l)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={pending || !pick}
        onClick={() => {
          if (pick) {
            onAdd(pick);
            setPick("");
          }
        }}
        className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
      >
        Add
      </button>
    </div>
  );
}

// ─── GroupForm ──────────────────────────────────────────────────────────

function GroupForm({
  initial,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
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
        <div key={loc} hidden={activeTab !== loc} className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Name ({loc})</span>
            <input
              className="input"
              value={translations[loc].name}
              onChange={(e) =>
                setTranslations((t) => ({
                  ...t,
                  [loc]: {
                    ...t[loc],
                    name: e.target.value,
                    slug: t[loc].slug || slugify(e.target.value),
                  },
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-muted-foreground">Slug ({loc})</span>
            <input
              className="input"
              value={translations[loc].slug}
              onChange={(e) =>
                setTranslations((t) => ({ ...t, [loc]: { ...t[loc], slug: e.target.value } }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-xs uppercase text-muted-foreground">
              Meta title — optional, max 70
            </span>
            <input
              className="input"
              maxLength={70}
              value={translations[loc].metaTitle}
              onChange={(e) =>
                setTranslations((t) => ({
                  ...t,
                  [loc]: { ...t[loc], metaTitle: e.target.value },
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-xs uppercase text-muted-foreground">
              Meta description — optional, max 160
            </span>
            <textarea
              className="input min-h-[60px]"
              maxLength={160}
              value={translations[loc].metaDescription}
              onChange={(e) =>
                setTranslations((t) => ({
                  ...t,
                  [loc]: { ...t[loc], metaDescription: e.target.value },
                }))
              }
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
