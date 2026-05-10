"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Lightweight searchable single-select. No third-party dep — the catalog
 * sizes we hit (≤ a few thousand locations / features) don't justify
 * Headless UI's combobox. Keyboard-accessible: arrow keys to move, enter
 * to commit, escape to close.
 *
 * Filter is a case-insensitive substring match on `label`. `description`
 * (optional) is shown but not searched against — kept dense intentionally.
 *
 * Pass `value=""` for "no selection". The selected option's label is
 * displayed in the input when the popup is closed; opening the popup
 * resets the input to the user's query.
 */

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
};

export type ComboboxProps = {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** Max number of suggestions rendered — keeps the list scroll bounded
   *  on huge catalogs. Defaults to 50 (covers typical filter UX). */
  maxResults?: number;
};

export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  emptyText = "No matches",
  disabled,
  className,
  maxResults = 50,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, maxResults);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, maxResults);
  }, [options, query, maxResults]);

  // Reset highlight when the visible filter set changes (length is a
  // sufficient proxy and avoids re-running on identity-only diffs).
  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length]);

  // Click-outside closes the popup.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function commit(option: ComboboxOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIdx];
      if (opt) commit(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const inputValue = open ? query : (selected?.label ?? "");

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className="input"
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKey}
      />
      {selected && !open && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      )}

      {open && (
        <div
          id={listboxId}
          // biome-ignore lint/a11y/useSemanticElements: WAI-ARIA combobox pattern needs role="listbox" — a <select> would break the search-as-you-type input that's the whole point of this component
          role="listbox"
          tabIndex={-1}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-background shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</div>
          ) : (
            filtered.map((o, i) => (
              <div
                key={o.value}
                // biome-ignore lint/a11y/useSemanticElements: paired with role="listbox" above
                role="option"
                tabIndex={-1}
                aria-selected={i === activeIdx}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  // mousedown beats blur — commit before focus leaves the input
                  e.preventDefault();
                  commit(o);
                }}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  i === activeIdx ? "bg-muted" : ""
                }`}
              >
                <div className="font-medium">{o.label}</div>
                {o.description && (
                  <div className="text-xs text-muted-foreground">{o.description}</div>
                )}
              </div>
            ))
          )}
          {filtered.length === maxResults && options.length > maxResults && (
            <div className="px-3 py-1 text-[10px] text-muted-foreground">
              Showing {maxResults} matches — refine your query
            </div>
          )}
        </div>
      )}
    </div>
  );
}
