import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-charcoal-soft">This page could not be found.</p>
      <Link to="/" className="rounded-full bg-forest px-6 py-3 font-semibold text-white">Back to home</Link>
    </main>
  );
}
