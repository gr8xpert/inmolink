/**
 * Inline Handlebars templates for PDF brochures (Sprint 11).
 *
 * Kept as TS string literals so the worker bundle is self-contained — no
 * runtime template loading. The CSS is intentionally minimal so Puppeteer's
 * print stylesheet renders predictably.
 */

export const PROPERTY_BROCHURE_TEMPLATE = `<!doctype html>
<html lang="{{locale}}">
<head>
<meta charset="utf-8" />
<title>{{property.title}}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #111; margin: 0; padding: 0; font-size: 12px; line-height: 1.4; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 14px; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .price { font-size: 18px; font-weight: 600; color: #0a7d3e; }
  .meta { color: #555; font-size: 11px; margin-bottom: 12px; }
  .agency { font-size: 10px; color: #777; text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .image { width: 100%; height: 240px; object-fit: cover; border-radius: 6px; background: #eee; }
  .features { display: flex; flex-wrap: wrap; gap: 6px; }
  .feature { background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 11px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd;
            font-size: 10px; color: #888; }
  .keyfacts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
              background: #f9fafb; padding: 12px; border-radius: 6px; }
  .keyfact { text-align: center; }
  .keyfact .label { color: #666; font-size: 9px; text-transform: uppercase; }
  .keyfact .value { font-size: 14px; font-weight: 600; }
</style>
</head>
<body>
  <div class="agency">{{agency.name}}</div>
  <h1>{{property.title}}</h1>
  <div class="meta">
    {{#if property.location}}{{property.location}} · {{/if}}{{property.transactionType}}
  </div>
  <div class="price">{{property.priceFormatted}}</div>

  {{#if property.coverImage}}
    <img class="image" src="{{property.coverImage}}" alt="{{property.title}}" />
  {{/if}}

  <div class="keyfacts">
    {{#if property.bedrooms}}<div class="keyfact"><div class="value">{{property.bedrooms}}</div><div class="label">Bedrooms</div></div>{{/if}}
    {{#if property.bathrooms}}<div class="keyfact"><div class="value">{{property.bathrooms}}</div><div class="label">Bathrooms</div></div>{{/if}}
    {{#if property.areaM2}}<div class="keyfact"><div class="value">{{property.areaM2}} m²</div><div class="label">Built</div></div>{{/if}}
    {{#if property.plotM2}}<div class="keyfact"><div class="value">{{property.plotM2}} m²</div><div class="label">Plot</div></div>{{/if}}
  </div>

  {{#if property.description}}
    <h2>Description</h2>
    <p>{{property.description}}</p>
  {{/if}}

  {{#if property.features.length}}
    <h2>Features</h2>
    <div class="features">
      {{#each property.features}}<span class="feature">{{this}}</span>{{/each}}
    </div>
  {{/if}}

  <div class="footer">
    Generated {{generatedAt}} · Inmolink · {{agency.name}}
  </div>
</body>
</html>`;

export const PORTFOLIO_TEMPLATE = `<!doctype html>
<html lang="{{locale}}">
<head>
<meta charset="utf-8" />
<title>{{agency.name}} Portfolio</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #111; margin: 0; padding: 0; font-size: 11px; line-height: 1.4; }
  .cover { padding: 40px 24px; text-align: center; page-break-after: always; }
  .cover h1 { font-size: 28px; margin: 0 0 8px; }
  .cover p { color: #666; margin: 0; }
  .property { padding: 16px 0; page-break-inside: avoid; page-break-after: always; }
  .property:last-child { page-break-after: auto; }
  .property h2 { font-size: 16px; margin: 0 0 4px; }
  .property .meta { color: #555; font-size: 10px; margin-bottom: 6px; }
  .property .price { font-size: 14px; font-weight: 600; color: #0a7d3e; }
  .property img { width: 100%; height: 200px; object-fit: cover; border-radius: 6px;
                  background: #eee; margin: 8px 0; }
  .property .desc { color: #333; }
  .footer { font-size: 9px; color: #888; text-align: center; padding-top: 16px; }
</style>
</head>
<body>
  <div class="cover">
    <h1>{{agency.name}}</h1>
    <p>Property Portfolio · Generated {{generatedAt}}</p>
    <p>{{properties.length}} properties</p>
  </div>
  {{#each properties}}
    <div class="property">
      <h2>{{this.title}}</h2>
      <div class="meta">
        {{#if this.location}}{{this.location}} · {{/if}}{{this.transactionType}}
        {{#if this.bedrooms}} · {{this.bedrooms}}bd{{/if}}
        {{#if this.bathrooms}} · {{this.bathrooms}}ba{{/if}}
        {{#if this.areaM2}} · {{this.areaM2}}m²{{/if}}
      </div>
      <div class="price">{{this.priceFormatted}}</div>
      {{#if this.coverImage}}<img src="{{this.coverImage}}" alt="{{this.title}}" />{{/if}}
      <p class="desc">{{this.description}}</p>
    </div>
  {{/each}}
  <div class="footer">Inmolink · {{agency.name}}</div>
</body>
</html>`;
