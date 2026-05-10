import { ApiError, apiFetch } from "@/lib/api";
import { auth } from "@inmolink/auth";
import type { inviteSchemas } from "@inmolink/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { AcceptExistingForm } from "./accept-existing-form";
import { AcceptForm } from "./accept-form";

type Props = {
  params: Promise<{ locale: string; token: string }>;
};

/**
 * Anonymous-friendly accept page. Looks up the invite via the api, then
 * branches on the visitor's auth state:
 *
 *  - signed-in user with matching email → one-click accept
 *  - signed-in user with mismatched email → tell them to sign out
 *  - signed-in user already in another agency → conflict message
 *  - anonymous → render the new-account form
 *
 * Invite expired / accepted / missing → friendly empty state, no 404.
 */

export default async function InvitePage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "invite" });

  let invite: inviteSchemas.InviteForAccept | null = null;
  let lookupError: string | null = null;
  try {
    invite = await apiFetch<inviteSchemas.InviteForAccept>(
      `/api/public/invites/${encodeURIComponent(token)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 410)) {
      lookupError = t("expired");
    } else if (err instanceof ApiError) {
      lookupError = err.message;
    } else {
      throw err;
    }
  }

  const session = await auth();
  const sameEmail =
    session?.user && invite
      ? session.user.email.toLowerCase() === invite.email.toLowerCase()
      : false;

  return (
    <main className="container mx-auto max-w-md space-y-6 p-8 pt-16">
      {invite ? (
        <header className="space-y-3 text-center">
          {invite.agency.logoPublicUrl && (
            <img
              src={invite.agency.logoPublicUrl}
              alt={invite.agency.name}
              className="mx-auto h-16 w-16 rounded-md object-contain"
            />
          )}
          <h1 className="text-2xl font-bold">{t("title", { agencyName: invite.agency.name })}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </header>
      ) : (
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">{t("title", { agencyName: "" })}</h1>
        </header>
      )}

      {lookupError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {lookupError}
        </p>
      )}

      {invite && session?.user && !sameEmail && (
        <p className="rounded-md border bg-muted/30 p-3 text-sm">
          {t("signOutFirst")}{" "}
          <Link href={`/${locale}/sign-in`} className="underline">
            {t("email")}: {invite.email}
          </Link>
        </p>
      )}

      {invite &&
        session?.user &&
        sameEmail &&
        session.user.agencyId &&
        session.user.agencyId !== invite.agency.id && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {t("alreadyMember")}
          </p>
        )}

      {invite &&
        session?.user &&
        sameEmail &&
        (!session.user.agencyId || session.user.agencyId === invite.agency.id) && (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {t("alreadySignedIn", { email: session.user.email, agencyName: invite.agency.name })}
            </p>
            <AcceptExistingForm locale={locale} token={token} agencyName={invite.agency.name} />
          </>
        )}

      {invite && !session?.user && <AcceptForm locale={locale} token={token} invite={invite} />}

      <div className="pt-4 text-center text-xs text-muted-foreground">
        <Link href={`/${locale}/sign-in`} className="underline">
          {t("email")}
        </Link>
      </div>
    </main>
  );
}
