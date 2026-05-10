"use client";

import { adminLocationSchemas } from "@inmolink/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createLocationAction,
  deleteLocationAction,
  reorderLocationAction,
  updateLocationAction,
} from "./actions";

/**
 * Super-admin curation UI for the 4-level Location tree
 * (COUNTRY → REGION → CITY → AREA).
 *
 * The api returns a flat array; we build the tree client-side by
 * grouping on `parentId`. Each node renders as one row with indentation
 * = level depth. "+ Add child" is hidden when the node is at AREA
 * (no valid next level).
 */

const LOCALES = ["en", "es", "de", "fr"] as const;
type Locale = (typeof LOCALES)[number];

type Loc = adminLocationSchemas.AdminLocation;
type LocSubmit = adminLocationSchemas.AdminLocationUpdate;
type Level = adminLocationSchemas.LocationLevel;

const LEVEL_DEPTH: Record<Level, number> = { COUNTRY: 0, REGION: 1, CITY: 2, AREA: 3 };
const slugRe = /^[a-z0-9-]+$/;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

type TBlock = {
  name: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
};

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

type Props = {
  locale: string;
  locations: Loc[];
};

export function AdminLocations({ locale, locations }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  // Either "root" (creating a COUNTRY) or a parent id (creating its child level).
  const [creatingChildOf, setCreatingChildOf] = useState<string | "root" | null>(null);

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
            setEditing(null);
            setCreatingChildOf(null);
          } else {
            setError(res.error ?? "Update failed");
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Update failed");
        }
      });
    };
  }

  function toggleExpand(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group by parentId. Roots have parentId === null (countries).
  const byParent = new Map<string | null, Loc[]>();
  for (const l of locations) {
    const k = l.parentId ?? null;
    const arr = byParent.get(k) ?? [];
    arr.push(l);
    byParent.set(k, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);

  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tree</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => setCreatingChildOf((v) => (v === "root" ? null : "root"))}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {creatingChildOf === "root" ? "Cancel" : "+ New country"}
        </button>
      </div>

      {creatingChildOf === "root" && (
        <LocationForm
          parentId={null}
          level="COUNTRY"
          submitLabel="Create country"
          pending={pending}
          onCancel={() => setCreatingChildOf(null)}
          onSubmit={withRefresh((body: adminLocationSchemas.AdminLocationCreate | LocSubmit) =>
            createLocationAction(locale, body as adminLocationSchemas.AdminLocationCreate),
          )}
        />
      )}

      <ul className="space-y-1">
        {roots.map((node, idx) => (
          <TreeNode
            key={node.id}
            node={node}
            siblingsAt={roots.length}
            idx={idx}
            byParent={byParent}
            depth={0}
            expanded={expanded}
            editing={editing}
            creatingChildOf={creatingChildOf}
            pending={pending}
            locale={locale}
            onToggleExpand={toggleExpand}
            onEditStart={(id) => setEditing(id)}
            onEditCancel={() => setEditing(null)}
            onUpdate={withRefresh((id: string, body: LocSubmit) =>
              updateLocationAction(locale, id, body),
            )}
            onDelete={(node) => {
              const en = node.translations.find((t) => t.locale === "en")?.name ?? node.id;
              if (
                window.confirm(
                  `Delete ${node.level} "${en}"? (will fail if it has children or refs)`,
                )
              ) {
                withRefresh(() => deleteLocationAction(locale, node.id))();
              }
            }}
            onMove={(id, dir, position) =>
              withRefresh(() => reorderLocationAction(locale, id, position + dir))()
            }
            onCreateChildToggle={(id) => setCreatingChildOf((v) => (v === id ? null : id))}
            onCreateChild={withRefresh((body: adminLocationSchemas.AdminLocationCreate) =>
              createLocationAction(locale, body),
            )}
          />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({
  node,
  siblingsAt,
  idx,
  byParent,
  depth,
  expanded,
  editing,
  creatingChildOf,
  pending,
  locale,
  onToggleExpand,
  onEditStart,
  onEditCancel,
  onUpdate,
  onDelete,
  onMove,
  onCreateChildToggle,
  onCreateChild,
}: {
  node: Loc;
  siblingsAt: number;
  idx: number;
  byParent: Map<string | null, Loc[]>;
  depth: number;
  expanded: Set<string>;
  editing: string | null;
  creatingChildOf: string | "root" | null;
  pending: boolean;
  locale: string;
  onToggleExpand: (id: string) => void;
  onEditStart: (id: string) => void;
  onEditCancel: () => void;
  onUpdate: (id: string, body: LocSubmit) => void;
  onDelete: (node: Loc) => void;
  onMove: (id: string, dir: -1 | 1, position: number) => void;
  onCreateChildToggle: (id: string) => void;
  onCreateChild: (body: adminLocationSchemas.AdminLocationCreate) => void;
}) {
  const en = node.translations.find((t) => t.locale === "en")?.name ?? node.id.slice(0, 8);
  const isOpen = expanded.has(node.id);
  const isEditing = editing === node.id;
  const isCreatingChild = creatingChildOf === node.id;
  const childLevel = adminLocationSchemas.VALID_CHILD_LEVEL[node.level];
  const children = byParent.get(node.id) ?? [];

  return (
    <li>
      {isEditing ? (
        <div className="rounded-md border bg-muted/10 p-3" style={{ marginLeft: depth * 20 }}>
          <LocationForm
            parentId={node.parentId}
            level={node.level}
            initial={node}
            submitLabel="Save"
            pending={pending}
            onCancel={onEditCancel}
            onSubmit={(body) => onUpdate(node.id, body as LocSubmit)}
          />
        </div>
      ) : (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
          style={{ marginLeft: depth * 20 }}
        >
          <div className="flex min-w-0 items-center gap-2">
            {node.childCount > 0 ? (
              <button
                type="button"
                onClick={() => onToggleExpand(node.id)}
                aria-label={isOpen ? "Collapse" : "Expand"}
                className="w-5 shrink-0 text-muted-foreground hover:text-foreground"
              >
                {isOpen ? "▾" : "▸"}
              </button>
            ) : (
              <span aria-hidden="true" className="w-5 shrink-0" />
            )}
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {node.level}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {node.countryCode} · pos {node.position}
            </span>
            <span className="truncate font-medium">{en}</span>
            {!node.isActive && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">Inactive</span>
            )}
            {node.childCount > 0 && (
              <span className="text-xs text-muted-foreground">({node.childCount})</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {childLevel && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onCreateChildToggle(node.id)}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                {isCreatingChild ? "Cancel" : `+ ${childLevel}`}
              </button>
            )}
            <button
              type="button"
              disabled={pending || idx === 0}
              onClick={() => onMove(node.id, -1, node.position)}
              aria-label="Move up"
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={pending || idx === siblingsAt - 1}
              onClick={() => onMove(node.id, 1, node.position)}
              aria-label="Move down"
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onEditStart(node.id)}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(node)}
              className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {isCreatingChild && childLevel && (
        <div className="my-2" style={{ marginLeft: (depth + 1) * 20 }}>
          <LocationForm
            parentId={node.id}
            level={childLevel}
            defaultCountryCode={node.countryCode}
            submitLabel={`Create ${childLevel}`}
            pending={pending}
            onCancel={() => onCreateChildToggle(node.id)}
            onSubmit={(body) => onCreateChild(body as adminLocationSchemas.AdminLocationCreate)}
          />
        </div>
      )}

      {isOpen && children.length > 0 && (
        <ul className="space-y-1">
          {children.map((child, ci) => (
            <TreeNode
              key={child.id}
              node={child}
              siblingsAt={children.length}
              idx={ci}
              byParent={byParent}
              depth={depth + 1}
              expanded={expanded}
              editing={editing}
              creatingChildOf={creatingChildOf}
              pending={pending}
              locale={locale}
              onToggleExpand={onToggleExpand}
              onEditStart={onEditStart}
              onEditCancel={onEditCancel}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onMove={onMove}
              onCreateChildToggle={onCreateChildToggle}
              onCreateChild={onCreateChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ─── LocationForm ───────────────────────────────────────────────────────

function LocationForm({
  parentId,
  level,
  initial,
  defaultCountryCode,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  parentId: string | null;
  level: Level;
  initial?: Loc;
  defaultCountryCode?: string;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  // Accepts both Create (for new) and Update (for edit) shapes via the
  // discriminator the caller picks.
  onSubmit: (body: adminLocationSchemas.AdminLocationCreate | LocSubmit) => void;
}) {
  const [translations, setTranslations] = useState(loadTranslations(initial?.translations ?? []));
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? defaultCountryCode ?? "");
  const [latitude, setLatitude] = useState(
    initial?.latitude !== null && initial?.latitude !== undefined ? String(initial.latitude) : "",
  );
  const [longitude, setLongitude] = useState(
    initial?.longitude !== null && initial?.longitude !== undefined
      ? String(initial.longitude)
      : "",
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [activeTab, setActiveTab] = useState<Locale>("en");
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      const trs = trimTranslations(translations);
      const lat = latitude.trim() === "" ? null : Number(latitude);
      const lon = longitude.trim() === "" ? null : Number(longitude);
      if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90))
        throw new Error("Latitude must be between -90 and 90");
      if (lon !== null && (!Number.isFinite(lon) || lon < -180 || lon > 180))
        throw new Error("Longitude must be between -180 and 180");
      if (countryCode.length !== 2)
        throw new Error("Country code must be 2 letters (ISO 3166-1 alpha-2)");

      // For new nodes we send `level + parentId`; for edits those are
      // immutable, so we only send the mutable fields.
      if (initial) {
        onSubmit({
          countryCode: countryCode.toUpperCase(),
          latitude: lat,
          longitude: lon,
          isActive,
          translations: trs,
        });
      } else {
        onSubmit({
          level,
          parentId,
          countryCode: countryCode.toUpperCase(),
          latitude: lat,
          longitude: lon,
          isActive,
          translations: trs,
        });
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Validation error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono uppercase">{level}</span>
        <span>depth {LEVEL_DEPTH[level]}</span>
        {parentId && <span>· parent {parentId.slice(0, 8)}</span>}
      </div>

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

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-muted-foreground">Country (ISO-2)</span>
          <input
            className="input uppercase"
            maxLength={2}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            placeholder="ES"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-muted-foreground">Latitude (optional)</span>
          <input
            className="input"
            inputMode="decimal"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="36.7213"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase text-muted-foreground">Longitude (optional)</span>
          <input
            className="input"
            inputMode="decimal"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="-4.4214"
          />
        </label>
      </div>

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
