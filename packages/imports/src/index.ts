/**
 * Feed import connectors (PLAN §10 / §11.5).
 *
 * Three connectors land in Sprint 5:
 * - Kyero (priority — `samples/feeds/kyero-sample.xml` is the unit-test fixture)
 * - Resale Online
 * - Generic XML (mappable per-agency field config)
 *
 * Implementation rule: streaming SAX parser only. Production feeds reach
 * 100+ MB; never load whole feeds into memory. See README in samples/feeds.
 */
export * from "./connector";
export * from "./connectors/kyero";
