import { motion } from 'framer-motion'

export default function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-base-100" aria-label="Loading Kogni">
      <div className="text-center">
        <motion.img
          src="/kogni-logo.png"
          alt=""
          width={56}
          height={56}
          draggable={false}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
          className="mx-auto rounded-2xl"
        />
        <p className="mt-4 text-sm font-semibold text-base-content/60">Preparing your learning space…</p>
      </div>
    </main>
  )
}
