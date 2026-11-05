import { ArrowLeft, Church } from 'lucide-react';
import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary-950 px-4 py-12 text-center text-white">
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_28rem),radial-gradient(circle_at_bottom_right,rgba(124,58,237,0.55),transparent_34rem)]"
    />
    <div className="relative max-w-lg">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-amber-300 ring-1 ring-white/15">
        <Church className="h-8 w-8" />
      </span>
      <p className="mt-6 text-7xl font-semibold text-primary-300 sm:text-8xl">404</p>
      <h1 className="mt-4 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 leading-relaxed text-primary-100">
        The page may have moved, or your current workspace may not include it.
      </p>
      <Link
        className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-primary-900 shadow-lg hover:bg-primary-50"
        to="/"
      >
        <ArrowLeft className="h-4 w-4" /> Return to dashboard
      </Link>
    </div>
  </main>
);
