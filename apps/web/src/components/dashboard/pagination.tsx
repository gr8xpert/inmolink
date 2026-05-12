import { cn } from "@inmolink/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

type Props = {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  /** Builds the href for a given page number. Caller carries filters. */
  hrefForPage: (page: number) => string;
  /** Number of sibling pages on each side of current. Default 1. */
  siblingCount?: number;
  className?: string;
};

/**
 * « ‹ 1 … 4 5 6 … 12 › »
 *
 * Compact numbered pagination. Renders nothing when there's only one page.
 * Caller owns the URL construction so filters / sort / search params are
 * preserved across pages — we don't make assumptions about what's in the
 * query string.
 */
export function Pagination({ page, totalPages, hrefForPage, siblingCount = 1, className }: Props) {
  if (totalPages <= 1) return null;

  const pages = buildPageList(page, totalPages, siblingCount);
  const prevHref = page > 1 ? hrefForPage(page - 1) : null;
  const nextHref = page < totalPages ? hrefForPage(page + 1) : null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <PageButton href={prevHref} ariaLabel="Previous page" disabled={!prevHref} rel="prev">
        <ChevronLeft className="h-4 w-4" />
      </PageButton>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`gap-${idx}`}
            className="px-2 text-sm text-muted-foreground"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <PageButton
            key={p}
            href={p === page ? null : hrefForPage(p)}
            ariaLabel={`Page ${p}`}
            ariaCurrent={p === page ? "page" : undefined}
            active={p === page}
            disabled={p === page}
          >
            {p}
          </PageButton>
        ),
      )}

      <PageButton href={nextHref} ariaLabel="Next page" disabled={!nextHref} rel="next">
        <ChevronRight className="h-4 w-4" />
      </PageButton>
    </nav>
  );
}

function PageButton({
  href,
  children,
  active,
  disabled,
  ariaLabel,
  ariaCurrent,
  rel,
}: {
  href: string | null;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  ariaCurrent?: "page";
  rel?: string;
}) {
  const className = cn(
    "inline-flex h-8 min-w-8 items-center justify-center border px-2 text-sm font-medium transition-all duration-200",
    active
      ? "border-primary bg-primary text-primary-foreground shadow-sm"
      : "border-border bg-card text-foreground hover:bg-muted hover:border-primary/30",
    disabled && !active && "cursor-not-allowed opacity-40 hover:bg-card",
  );

  if (!href) {
    return (
      <span className={className} aria-label={ariaLabel} aria-current={ariaCurrent}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className} aria-label={ariaLabel} rel={rel}>
      {children}
    </Link>
  );
}

/**
 * Build a compact page list with ellipses. Examples (page, total, sibling=1):
 *   (1, 1, 1)   → []
 *   (1, 5, 1)   → [1, 2, 3, 4, 5]
 *   (1, 20, 1)  → [1, 2, 3, …, 20]
 *   (5, 20, 1)  → [1, …, 4, 5, 6, …, 20]
 *   (20, 20, 1) → [1, …, 18, 19, 20]
 */
function buildPageList(
  page: number,
  totalPages: number,
  siblingCount: number,
): Array<number | "…"> {
  const firstPage = 1;
  const lastPage = totalPages;
  const totalNumbers = siblingCount * 2 + 5; // first + last + current + 2*siblings + 2 dots

  if (totalPages <= totalNumbers) {
    return rangeInclusive(firstPage, lastPage);
  }

  const leftSibling = Math.max(page - siblingCount, firstPage);
  const rightSibling = Math.min(page + siblingCount, lastPage);

  const showLeftDots = leftSibling > firstPage + 1;
  const showRightDots = rightSibling < lastPage - 1;

  if (!showLeftDots && showRightDots) {
    const leftRange = rangeInclusive(firstPage, siblingCount * 2 + 3);
    return [...leftRange, "…", lastPage];
  }
  if (showLeftDots && !showRightDots) {
    const rightRange = rangeInclusive(lastPage - (siblingCount * 2 + 2), lastPage);
    return [firstPage, "…", ...rightRange];
  }
  return [firstPage, "…", ...rangeInclusive(leftSibling, rightSibling), "…", lastPage];
}

function rangeInclusive(start: number, end: number): number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}
