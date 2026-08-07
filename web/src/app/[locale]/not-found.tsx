import { Link } from '@/i18n/routing';

/**
 * 404. Deliberately offers routes rather than an apology — a dead end with no
 * next step is how a user leaves.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <span className="font-display text-5xl font-bold tracking-tight text-brand">404</span>
      <h1 className="mt-4 font-display text-xl font-bold tracking-tight">We could not find that page</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate2">
        The link may be out of date, or the record may belong to another organisation.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/catalog" className="btn-primary">Browse the catalogue</Link>
        <Link href="/" className="btn-ghost">Go home</Link>
      </div>
    </div>
  );
}
