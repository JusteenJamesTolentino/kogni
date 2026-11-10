import { ArrowRight, Check, Layers3 } from 'lucide-react'
import { motion } from 'framer-motion'

export interface SeriesCompletionProps {
  partNumber: number
  ratedDistinctCount: number
  nextPartNumber: number
  nextPartAvailable: boolean
  unavailableMessage?: string
  onContinue?: (nextPartNumber: number) => void | Promise<void>
  onReturn: () => void | Promise<void>
  returnLabel?: string
}

export default function SeriesCompletion({
  partNumber,
  ratedDistinctCount,
  nextPartNumber,
  nextPartAvailable,
  unavailableMessage,
  onContinue,
  onReturn,
  returnLabel = 'Return to deck',
}: SeriesCompletionProps) {
  const exactlyThirtyRated = ratedDistinctCount === 30
  const canContinue = exactlyThirtyRated && nextPartAvailable && Boolean(onContinue)

  return (
    <main className="grid min-h-[75vh] place-items-center px-4 py-12">
      <motion.section initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card w-full max-w-lg border border-base-300 bg-base-100 text-center shadow-2xl">
        <div className="card-body items-center p-8 sm:p-12">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-success/15 text-success"><Check size={40} strokeWidth={3} aria-hidden="true" /></div>
          <div className="badge badge-success badge-outline mt-2 gap-1"><Layers3 size={13} aria-hidden="true" /> Part {partNumber} complete</div>
          <h1 className="mt-1 text-3xl font-black">Excellent work</h1>
          <p className="text-base-content/60">
            {exactlyThirtyRated
              ? `You rated all 30 distinct questions in Part ${partNumber}.`
              : `You rated ${ratedDistinctCount} of the required 30 distinct questions.`}
          </p>

          {!exactlyThirtyRated && <div role="alert" className="alert alert-warning mt-2 text-left"><span>Continue is available only after exactly 30 distinct questions have been rated.</span></div>}
          {exactlyThirtyRated && !nextPartAvailable && <div role="status" className="alert mt-2 text-left"><span>{unavailableMessage || `Part ${nextPartNumber} is not available yet. The creator must publish it before you can continue.`}</span></div>}

          <div className="card-actions mt-4 grid w-full gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void onContinue?.(nextPartNumber)} className="btn btn-primary w-full gap-2" disabled={!canContinue}>
              Continue to Part {nextPartNumber}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => void onReturn()} className="btn btn-outline w-full">{returnLabel}</button>
          </div>
          <p className="mt-2 text-xs text-base-content/50">No continuation is generated automatically. Only the creator can generate and publish another part.</p>
        </div>
      </motion.section>
    </main>
  )
}
