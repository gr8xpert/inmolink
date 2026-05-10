import { generateKeyPairSync, randomBytes } from "node:crypto";
import { promises as dnsPromises } from "node:dns";
import { encryptToString } from "@inmolink/auth";
import { prisma } from "@inmolink/db";
import type { marketingSchemas } from "@inmolink/shared";
import { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../plugins/auth";
import { ConflictError, ForbiddenError, NotFoundError, resolveAgencyId } from "./service";

const DKIM_SELECTOR = "inmolink";

/**
 * Build the canonical record set for a given domain. The caller is
 * responsible for adding/looking these up at their DNS provider.
 */
function recordsFor(
  domain: string,
  verificationToken: string,
  publicDkimKey: string | null,
): marketingSchemas.EmailDomainRecord[] {
  const records: marketingSchemas.EmailDomainRecord[] = [
    {
      kind: "TXT",
      host: `_inmolink.${domain}`,
      value: `inmolink-verify=${verificationToken}`,
      purpose: "VERIFY",
    },
    {
      kind: "TXT",
      host: domain,
      // include:_spf.inmolink.eu would be the prod path; use our hostname
      // as a placeholder so deployers can swap to their own SPF host.
      value: "v=spf1 include:_spf.inmolink.eu ~all",
      purpose: "SPF",
    },
    {
      kind: "TXT",
      host: `_dmarc.${domain}`,
      value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@inmolink.eu",
      purpose: "DMARC",
    },
  ];
  if (publicDkimKey) {
    records.push({
      kind: "TXT",
      host: `${DKIM_SELECTOR}._domainkey.${domain}`,
      value: `v=DKIM1; k=rsa; p=${publicDkimKey}`,
      purpose: "DKIM",
    });
  }
  return records;
}

/**
 * Strip PEM header/footer + line breaks so the public key can be embedded
 * in a DNS TXT record per RFC 6376.
 */
function dkimPublicKeyFromPem(pem: string): string {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/, "")
    .replace(/-----END [A-Z ]+-----/, "")
    .replace(/\s+/g, "");
}

function toDomainOutput(
  row: {
    id: string;
    domain: string;
    verifiedAt: Date | null;
    verificationToken: string;
    spfStatus: string;
    dkimStatus: string;
    dmarcStatus: string | null;
  },
  publicDkimKey: string | null,
): marketingSchemas.EmailDomain {
  return {
    id: row.id,
    domain: row.domain,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verificationToken: row.verificationToken,
    spfStatus: (row.spfStatus as marketingSchemas.EmailDomainStatus) ?? "PENDING",
    dkimStatus: (row.dkimStatus as marketingSchemas.EmailDomainStatus) ?? "PENDING",
    dmarcStatus: row.dmarcStatus ? (row.dmarcStatus as marketingSchemas.EmailDomainStatus) : null,
    records: recordsFor(row.domain, row.verificationToken, publicDkimKey),
  };
}

export async function listDomains(
  user: AuthenticatedUser,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailDomain[]> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const rows = await prisma.agencyEmailDomain.findMany({
    where: { agencyId },
    orderBy: [{ domain: "asc" }],
  });
  // Pull the agency's DKIM public key (we store private+selector on
  // AgencyEmailConfig per existing schema; the public is derived from it).
  const cfg = await prisma.agencyEmailConfig.findUnique({
    where: { agencyId },
    select: { dkimDomain: true, dkimPrivateKeyEnc: true },
  });
  // We don't decrypt + parse the private key on every list — instead we
  // store the public bytes alongside on creation and surface them. To keep
  // the schema lean for v1 we recompute when present (the worker also
  // signs with the private key directly).
  const dkimPublic = await derivePublicDkimKeyForList(cfg);
  return rows.map((r) => toDomainOutput(r, dkimPublic));
}

async function derivePublicDkimKeyForList(
  _cfg: { dkimDomain: string | null; dkimPrivateKeyEnc: string | null } | null,
): Promise<string | null> {
  // The encrypted private key isn't decrypted on read — the public key is
  // derivable from it but requires the encryption key, which belongs only
  // to the api/worker process at run-time. The records UI tells the user
  // to hit "regenerate DKIM" if they need the public key string; that
  // round-trip shows the freshly-generated public bytes once and rotates
  // the private side. For v1 this is enough; if this becomes friction we
  // can persist the public key as a non-sensitive column.
  return null;
}

export async function createDomain(
  user: AuthenticatedUser,
  input: marketingSchemas.EmailDomainInput,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailDomain> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const verificationToken = randomBytes(16).toString("hex");
  try {
    const r = await prisma.agencyEmailDomain.create({
      data: { agencyId, domain: input.domain.toLowerCase(), verificationToken },
    });
    return toDomainOutput(r, null);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("Domain already added");
    }
    throw err;
  }
}

export async function deleteDomain(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<void> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const r = await prisma.agencyEmailDomain.deleteMany({ where: { id, agencyId } });
  if (r.count === 0) throw new NotFoundError("Domain not found");
}

/**
 * Generate a 2048-bit RSA DKIM keypair, encrypt the private key, and persist
 * onto AgencyEmailConfig. Returns the public key (for the DNS TXT record).
 *
 * The dashboard surfaces the public key once on rotation; nodemailer (worker)
 * decrypts the private key at send time.
 */
export async function rotateDkimKey(
  user: AuthenticatedUser,
  encryptionKeyHex: string,
  queryAgencyId: string | undefined,
): Promise<{ selector: string; publicKey: string }> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const cfg = await prisma.agencyEmailConfig.findUnique({ where: { agencyId } });
  if (!cfg) throw new ForbiddenError("Save SMTP config before generating DKIM keys");

  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const key = Buffer.from(encryptionKeyHex, "hex");
  const privateKeyEnc = encryptToString(privateKey, key);

  await prisma.agencyEmailConfig.update({
    where: { agencyId },
    data: {
      dkimDomain: cfg.dkimDomain ?? deriveDomainFromEmail(cfg.fromEmail),
      dkimSelector: DKIM_SELECTOR,
      dkimPrivateKeyEnc: privateKeyEnc,
    },
  });
  return { selector: DKIM_SELECTOR, publicKey: dkimPublicKeyFromPem(publicKey) };
}

function deriveDomainFromEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : email.toLowerCase();
}

/**
 * DNS-verify a domain by looking up the verification TXT + SPF + DKIM +
 * DMARC records and updating row statuses accordingly.
 */
export async function verifyDomain(
  user: AuthenticatedUser,
  id: string,
  queryAgencyId: string | undefined,
): Promise<marketingSchemas.EmailDomain> {
  const agencyId = resolveAgencyId(user, queryAgencyId);
  const row = await prisma.agencyEmailDomain.findFirst({ where: { id, agencyId } });
  if (!row) throw new NotFoundError("Domain not found");

  const verifyHost = `_inmolink.${row.domain}`;
  const dmarcHost = `_dmarc.${row.domain}`;
  const dkimHost = `${DKIM_SELECTOR}._domainkey.${row.domain}`;

  const [verifyOk, spfOk, dkimOk, dmarcOk] = await Promise.all([
    txtContains(verifyHost, `inmolink-verify=${row.verificationToken}`),
    txtContains(row.domain, "v=spf1"),
    txtContains(dkimHost, "v=DKIM1"),
    txtContains(dmarcHost, "v=DMARC1"),
  ]);

  await prisma.agencyEmailDomain.update({
    where: { id: row.id },
    data: {
      verifiedAt: verifyOk ? new Date() : null,
      spfStatus: spfOk ? "VERIFIED" : "FAILED",
      dkimStatus: dkimOk ? "VERIFIED" : "FAILED",
      dmarcStatus: dmarcOk ? "VERIFIED" : "FAILED",
    },
  });

  const next = await prisma.agencyEmailDomain.findUnique({ where: { id: row.id } });
  if (!next) throw new NotFoundError("Domain disappeared mid-verify");
  return toDomainOutput(next, null);
}

async function txtContains(host: string, needle: string): Promise<boolean> {
  try {
    const records = await dnsPromises.resolveTxt(host);
    return records.some((parts) => parts.join("").includes(needle));
  } catch {
    return false;
  }
}
