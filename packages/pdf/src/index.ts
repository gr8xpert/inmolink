/**
 * PDF rendering — Puppeteer + Handlebars.
 *
 * Used by the export worker (Sprint 11):
 * - PDF_PROPERTY:   single-property brochure (1-2 pages)
 * - PDF_PORTFOLIO:  multi-property portfolio (one page per property)
 *
 * Sprint 0 stub. Real Handlebars templates in apps/worker/templates/pdf/ on Sprint 11.
 *
 * IMPORTANT: PDFs are paid-tier-only (PLAN §6, §11). Auth check happens in the
 * Export queue handler, not here.
 */
export * from "./renderer";
