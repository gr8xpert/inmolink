# Sample feeds

Reference fixtures used during Kyero / Resale Online / Generic XML connector development (Sprint 5).

## kyero-sample.xml

- **Source**: `https://crm.abracasabra.es/property/feed/1/9ba4bf3e6fe2/Test_feed.xml`
- **Captured**: 2026-05-09
- **Size**: ~3.4 MB
- **Format**: Kyero feed_version 3
- **Properties**: 270 (all `price_freq=sale`)
- **Image URLs**: 8,962 (avg ~33 per property — much higher than the 50/property design average; sample skews wealthy listings)
- **Provinces**: Córdoba, Granada (Province), Málaga (Province), Seville
- **Locales**: English only (`<en>` tags) — production feeds may include other locales

## Kyero v3 schema (observed)

```xml
<root>
  <kyero>
    <feed_version>3</feed_version>
  </kyero>
  <property>
    <id>62733</id>                                  <!-- Kyero internal id -->
    <date>2026-05-08 07:41:54</date>                <!-- last update timestamp -->
    <ref>R5368168</ref>                             <!-- agency's reference (use as externalRef) -->
    <price>550000</price>
    <currency>EUR</currency>
    <price_freq>sale</price_freq>                   <!-- sale | rent | rentlong | rentshort -->
    <type>Townhouse</type>                          <!-- 14 distinct types in sample -->
    <town>Cómpeta</town>                            <!-- plain text, fuzzy-match to Location -->
    <province>Málaga (Province)</province>          <!-- plain text -->
    <video_url>https://youtu.be/wxrmHzmPZwQ</video_url>  <!-- optional, YouTube -->
    <beds>3</beds>
    <baths>3</baths>
    <surface_area>
      <built>205</built>                            <!-- m² -->
      <plot>249</plot>                              <!-- m² -->
    </surface_area>
    <features>
      <feature>
        <en>Sea View</en>                           <!-- locale-keyed inside each <feature> -->
      </feature>
      <!-- ... -->
    </features>
    <distances>
      <!-- distances to amenities (often empty in this sample) -->
    </distances>
    <desc>
      <en>Stunning Renovated Townhouse...</en>      <!-- locale-keyed long description -->
    </desc>
    <title>
      <en>Townhouse for sale in Cómpeta</en>        <!-- locale-keyed short title -->
    </title>
    <images>
      <image id="1">
        <url>https://cdn.resales-online.com/.../1-...jpg?v=...</url>
      </image>
      <!-- ... -->
    </images>
  </property>
  <!-- more <property> entries -->
</root>
```

### Property types in sample

B&B, Finca - Cortijo, Ground Floor Apartment, Hotel, Land, Middle Floor Apartment, Middle Floor Studio, Penthouse, Penthouse Duplex, Residential Plot, Semi-Detached House, Top Floor Apartment, Townhouse, Villa.

These don't 1:1 map to Inmolink's PropertyType taxonomy → connector needs a **type-mapping table** (`KyeroType → PropertyTypeId`) maintained by super-admin.

### Connector implementation notes (for Sprint 5)

1. **Streaming XML parse** — file is 3.4 MB but production feeds can be much larger (10K+ properties → 100+ MB). Use SAX parser (`sax`, `node-xml-stream`) not DOM, to avoid loading full file in memory.
2. **External ref** — use `<ref>` (agency's reference) as `Property.externalRef`, not `<id>` (Kyero's internal id). Agencies recognize their own ref.
3. **Town fuzzy-matching** — `<town>` is plain text. Match to `Location` table by `(countryCode='ES', name ILIKE town, level=CITY)`. If not found: `Location` table needs the city added (alert super-admin), property goes to `DRAFT` until resolved.
4. **Province** — kyero suffixes "(Province)" sometimes; strip it. Match against `Location` parent of CITY.
5. **Features** — match by name against `Feature` table (per-locale). Unknown features get logged (super-admin can extend the taxonomy).
6. **Image dedup** — image URLs from this feed include a `?v=<timestamp>` cache buster; that means re-imports may show "different" URLs for the same content. Hash the **content** (after download), not the URL — leverages our SHA-256 dedup pipeline (§5.1 PLAN).
7. **Image hotlink CDN** — feed's images live on `cdn.resales-online.com`. Kyero feed format → some agencies actually use Resales-online as their backend. Don't assume Kyero feed = Kyero CDN.
8. **Descriptions** — `<desc>` and `<title>` are locale-keyed (`<en>`, `<es>`, `<de>`, `<fr>`). Map to `PropertyTranslation` rows directly. If a locale is missing from feed → `PropertyTranslation` row not created (UI falls back to default).
9. **Empty `<distances>`** — common in real feeds; safely ignored.
10. **No lat/lng in this sample** — Kyero v3 spec includes optional `<location latitude="..." longitude="..."/>` but this feed doesn't have it. Connector must handle missing geo gracefully (Property.latitude/longitude nullable).

## Adding more samples

Drop XML files in this directory. Update this README with: source URL, capture date, format version, property count, observed quirks.
