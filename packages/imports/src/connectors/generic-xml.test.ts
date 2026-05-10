import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { type GenericXmlConfig, parseGenericXmlStream } from "./generic-xml";
import { parseResaleOnlineStream } from "./resale-online";

function fromString(s: string): NodeJS.ReadableStream {
  return Readable.from([s], { objectMode: false });
}

describe("Generic XML connector", () => {
  it("parses a custom-shaped feed via mappings", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <listing>
    <code>X-1</code>
    <pricing><total>250000</total><cur>EUR</cur></pricing>
    <kind>Apartment</kind>
    <city>Madrid</city>
    <region>Madrid</region>
    <stats><beds>2</beds><baths>1</baths><area>85</area></stats>
    <names>
      <name lang="en">Cosy 2-bed in Salamanca</name>
      <name lang="es">Acogedor 2 dormitorios en Salamanca</name>
    </names>
    <descriptions>
      <text lang="en">Lovely flat near the metro.</text>
    </descriptions>
    <amenities>
      <amenity>
        <label lang="en">Air conditioning</label>
        <label lang="es">Aire acondicionado</label>
      </amenity>
      <amenity>
        <label lang="en">Lift</label>
      </amenity>
    </amenities>
    <photos>
      <photo><src>https://example.com/a.jpg</src></photo>
      <photo><src>https://example.com/b.jpg</src></photo>
    </photos>
  </listing>
  <listing>
    <code>X-2</code>
    <pricing><total>1200</total></pricing>
    <kind>Apartment</kind>
    <city>Barcelona</city>
    <transaction>rentlong</transaction>
  </listing>
</root>`;

    const config: GenericXmlConfig = {
      itemTag: "listing",
      source: "GENERIC_XML",
      countryCode: "ES",
      mappings: [
        { path: "code", target: "externalRef" },
        { path: "pricing/total", target: "priceCents", transform: "money" },
        { path: "pricing/cur", target: "currency", transform: "upper" },
        { path: "kind", target: "typeName" },
        { path: "city", target: "townName" },
        { path: "region", target: "provinceName" },
        { path: "stats/beds", target: "bedrooms" },
        { path: "stats/baths", target: "bathrooms" },
        { path: "stats/area", target: "areaM2" },
        { path: "transaction", target: "transactionType", transform: "freqToTx" },
        { path: "names/name", target: "title", localeFromAttr: "lang" },
        { path: "descriptions/text", target: "description", localeFromAttr: "lang" },
        { path: "amenities/amenity/label", target: "feature", localeFromAttr: "lang" },
        { path: "photos/photo/src", target: "imageUrl" },
      ],
    };

    const out = [];
    for await (const l of parseGenericXmlStream(fromString(xml), config)) out.push(l);

    expect(out).toHaveLength(2);
    const a = out[0];
    if (!a) throw new Error("expected first listing");
    expect(a.externalRef).toBe("X-1");
    expect(a.priceCents).toBe(25_000_000n);
    expect(a.currency).toBe("EUR");
    expect(a.typeName).toBe("Apartment");
    expect(a.townName).toBe("Madrid");
    expect(a.bedrooms).toBe(2);
    expect(a.areaM2).toBe(85);
    expect(a.translations.en?.title).toBe("Cosy 2-bed in Salamanca");
    expect(a.translations.es?.title).toBe("Acogedor 2 dormitorios en Salamanca");
    expect(a.translations.en?.description).toBe("Lovely flat near the metro.");
    expect(a.features).toHaveLength(2);
    expect(a.features[0]?.canonical).toBe("Air conditioning");
    expect(a.features[0]?.perLocale.es).toBe("Aire acondicionado");
    expect(a.features[1]?.canonical).toBe("Lift");
    expect(a.imageUrls).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"]);

    const b = out[1];
    if (!b) throw new Error("expected second listing");
    expect(b.externalRef).toBe("X-2");
    expect(b.transactionType).toBe("RENT");
    expect(b.priceCents).toBe(120_000n);
    // Defaults applied for missing currency:
    expect(b.currency).toBe("EUR");
  });

  it("skips items missing externalRef / typeName / townName", async () => {
    const xml = `<?xml version="1.0"?>
<root>
  <listing><code></code><kind>Villa</kind><city>X</city></listing>
  <listing><code>OK</code><kind>Villa</kind><city>X</city></listing>
</root>`;
    const config: GenericXmlConfig = {
      itemTag: "listing",
      source: "GENERIC_XML",
      mappings: [
        { path: "code", target: "externalRef" },
        { path: "kind", target: "typeName" },
        { path: "city", target: "townName" },
      ],
    };
    const out = [];
    for await (const l of parseGenericXmlStream(fromString(xml), config)) out.push(l);
    expect(out).toHaveLength(1);
    expect(out[0]?.externalRef).toBe("OK");
  });
});

describe("Resale Online connector (preset over Generic XML)", () => {
  it("parses a Resale-shaped feed", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <property>
    <reference>R-100</reference>
    <price>425000</price>
    <currency>EUR</currency>
    <type>Villa</type>
    <town>Marbella</town>
    <province>Málaga (Province)</province>
    <country>ES</country>
    <bedrooms>4</bedrooms>
    <bathrooms>3</bathrooms>
    <surface_area><built>320</built><plot>1100</plot></surface_area>
    <transaction>sale</transaction>
    <last_updated>2026-04-01T00:00:00Z</last_updated>
    <title language="en">Hilltop Villa</title>
    <title language="es">Villa en la colina</title>
    <description language="en">Sea views.</description>
    <features>
      <feature><text language="en">Pool</text></feature>
      <feature><text language="en">Garage</text></feature>
    </features>
    <images>
      <image><url>https://cdn.resales-online.com/.../1.jpg?v=1</url></image>
      <image><url>https://cdn.resales-online.com/.../2.jpg?v=1</url></image>
    </images>
  </property>
</root>`;

    const out = [];
    for await (const l of parseResaleOnlineStream(fromString(xml))) out.push(l);

    expect(out).toHaveLength(1);
    const a = out[0];
    if (!a) throw new Error("expected listing");
    expect(a.source).toBe("RESALE_ONLINE");
    expect(a.externalRef).toBe("R-100");
    expect(a.priceCents).toBe(42_500_000n);
    expect(a.currency).toBe("EUR");
    expect(a.typeName).toBe("Villa");
    expect(a.townName).toBe("Marbella");
    expect(a.provinceName).toBe("Málaga"); // (Province) suffix stripped
    expect(a.bedrooms).toBe(4);
    expect(a.bathrooms).toBe(3);
    expect(a.areaM2).toBe(320);
    expect(a.plotM2).toBe(1100);
    expect(a.transactionType).toBe("SALE");
    expect(a.translations.en?.title).toBe("Hilltop Villa");
    expect(a.translations.es?.title).toBe("Villa en la colina");
    expect(a.translations.en?.description).toBe("Sea views.");
    expect(a.features.map((f) => f.canonical)).toEqual(["Pool", "Garage"]);
    expect(a.imageUrls).toHaveLength(2);
    expect(a.sourceUpdatedAt?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});
