import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { paths } from '../router/paths'

export default function NotFoundRoute() {
  return (
    <main className="grid min-h-screen place-items-center bg-base-200/35 px-4 py-12">
      <section className="max-w-lg text-center" aria-labelledby="not-found-title">
        <SearchX size={48} className="mx-auto text-base-content/30" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold uppercase tracking-[0.25em] text-primary">404</p>
        <h1 id="not-found-title" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Page not found</h1>
        <p className="mt-3 text-base-content/60">The Kogni page you requested does not exist or may have moved.</p>
        <Link to={paths.dashboard} className="btn btn-primary mt-6">Return to dashboard</Link>
      </section>
    </main>
  )
}
