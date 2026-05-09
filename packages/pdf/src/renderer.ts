import Handlebars from "handlebars";
import puppeteer, { type Browser } from "puppeteer";

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser?.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // memory-constrained workers
      "--disable-gpu",
    ],
  });
  return _browser;
}

export async function closeBrowser(): Promise<void> {
  if (_browser?.connected) {
    await _browser.close();
    _browser = null;
  }
}

export type RenderInput = {
  template: string; // Handlebars template source
  data: unknown;
  format?: "A4" | "Letter";
  landscape?: boolean;
  marginMm?: number;
};

/** Render a Handlebars template + data → PDF buffer. */
export async function renderPdf(input: RenderInput): Promise<Buffer> {
  const compiled = Handlebars.compile(input.template, { strict: true });
  const html = compiled(input.data);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const margin = `${input.marginMm ?? 12}mm`;
    return Buffer.from(
      await page.pdf({
        format: input.format ?? "A4",
        landscape: input.landscape ?? false,
        printBackground: true,
        margin: { top: margin, bottom: margin, left: margin, right: margin },
      }),
    );
  } finally {
    await page.close();
  }
}
