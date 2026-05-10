import Link from "next/link";

export function PublicFooter({ locale }: { locale: string }) {
  return (
    <footer className="mt-12 border-t bg-muted/30">
      <div className="container mx-auto flex flex-col items-start gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Inmolink · Realty Soft S.L.</p>
        <nav className="flex flex-wrap gap-4">
          <Link href={`/${locale}/privacy`} className="hover:text-foreground hover:underline">
            Privacy
          </Link>
          <Link href={`/${locale}/terms`} className="hover:text-foreground hover:underline">
            Terms
          </Link>
          <Link href={`/${locale}/cookies`} className="hover:text-foreground hover:underline">
            Cookies
          </Link>
          <a href="mailto:hello@inmolink.eu" className="hover:text-foreground hover:underline">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
