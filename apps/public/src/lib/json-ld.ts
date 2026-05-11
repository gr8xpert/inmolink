// Escapes characters that can break out of a <script> block when
// serializing JSON-LD. JSON.stringify alone is NOT safe inside
// <script>...</script> because it does not escape `<`, `>`, `&`,
// U+2028, or U+2029 — any of which can be supplied via agent input
// (property title/description, agency name, social URLs).
const LS = " ";
const PS = " ";

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LS)
    .join("\\u2028")
    .split(PS)
    .join("\\u2029");
}
