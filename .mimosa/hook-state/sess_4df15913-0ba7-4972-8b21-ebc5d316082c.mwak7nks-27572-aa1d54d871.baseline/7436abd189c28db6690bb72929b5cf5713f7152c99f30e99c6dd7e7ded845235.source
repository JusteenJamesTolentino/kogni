import { motion } from 'framer-motion'
import { BrainCircuit } from 'lucide-react'

export default function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-base-100" aria-label="Loading Kognit">
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-content"
        >
          <BrainCircuit size={28} aria-hidden="true" />
        </motion.div>
        <p className="mt-4 text-sm font-semibold text-base-content/60">Preparing your learning space…</p>
      </div>
    </main>
  )
}
