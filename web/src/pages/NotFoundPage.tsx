import { Link } from 'react-router-dom';

export const NotFoundPage = () => (
  <main className="flex min-h-screen items-center justify-center bg-gray-900 px-4 text-center text-white">
    <div>
      <p className="text-8xl font-bold text-primary-400">404</p>
      <h1 className="mt-4 text-3xl font-bold">Page not found</h1>
      <p className="mt-2 text-gray-400">The page you requested does not exist.</p>
      <Link className="mt-8 inline-block rounded-lg bg-primary-500 px-5 py-3 font-semibold hover:bg-primary-600" to="/">Return to dashboard</Link>
    </div>
  </main>
);
