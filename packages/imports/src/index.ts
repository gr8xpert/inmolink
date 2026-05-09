/**
 * Feed import connectors.
 *
 * Adapter interface + 3 connectors (PLAN §10 / ADR 0001):
 * - Kyero (priority — see samples/feeds/README.md for schema notes)
 * - Resale Online
 * - Generic XML (mappable per-agency field config)
 *
 * Sprint 0 — interface only. Real Kyero adapter lands in Sprint 5 using the
 * sample fixture at samples/feeds/kyero-sample.xml as primary unit-test input.
 *
 * Implementation rule (PLAN §11): use streaming SAX parser (sax),
 * NEVER load full feed into memory. Production feeds reach 100+ MB.
 */
export * from "./connector";
