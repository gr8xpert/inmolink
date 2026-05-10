/**
 * Merge-tag rendering for email subjects and bodies.
 *
 * Supported tags (Sprint 8):
 *   {{contact.firstName}} {{contact.lastName}} {{contact.email}}
 *   {{property.title}} {{property.url}}
 *   {{agency.name}}
 *   {{unsubscribeUrl}} {{trackingPixelUrl}}
 *
 * Replacement is intentionally simple — substring substitution against a
 * dot-paths object. Missing values render as empty strings (silent) rather
 * than leaving a literal `{{...}}` in the email. HTML escaping is applied
 * to the substituted value when the template is HTML.
 */

const TAG_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9._]*)\s*\}\}/g;

export type MergeContext = Record<string, unknown>;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function lookup(ctx: MergeContext, path: string): string {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return "";
    }
  }
  if (cur === null || cur === undefined) return "";
  return String(cur);
}

export function renderMergeTags(
  template: string,
  ctx: MergeContext,
  mode: "html" | "text" = "text",
): string {
  return template.replace(TAG_RE, (_, path: string) => {
    const v = lookup(ctx, path);
    return mode === "html" ? escapeHtml(v) : v;
  });
}

/**
 * Build the merge context for a recipient at send time. The same shape is
 * used for the dashboard preview so `{{property.title}}` substitutions
 * stay consistent.
 */
export function buildMergeContext(args: {
  contact: { email: string; firstName?: string | null; lastName?: string | null } | null;
  agency: { name: string };
  property?: { title: string | null; url: string | null } | null;
  unsubscribeUrl: string;
  trackingPixelUrl?: string;
}): MergeContext {
  return {
    contact: {
      email: args.contact?.email ?? "",
      firstName: args.contact?.firstName ?? "",
      lastName: args.contact?.lastName ?? "",
    },
    agency: {
      name: args.agency.name,
    },
    property: {
      title: args.property?.title ?? "",
      url: args.property?.url ?? "",
    },
    unsubscribeUrl: args.unsubscribeUrl,
    trackingPixelUrl: args.trackingPixelUrl ?? "",
  };
}
