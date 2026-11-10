import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes, PointerEvent, ReactNode } from 'react'

export interface ProfileCard3DProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children: ReactNode
  /** Maximum decorative tilt in degrees. */
  maxTilt?: number
}

const INTERACTIVE_POINTER_QUERY = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'

export default function ProfileCard3D({
  children,
  className = '',
  maxTilt = 5,
  onPointerMove,
  onPointerLeave,
  style,
  ...props
}: ProfileCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('')
  const [canTilt, setCanTilt] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(INTERACTIVE_POINTER_QUERY)
    const updateCapability = (): void => {
      setCanTilt(mediaQuery.matches)
      if (!mediaQuery.matches) setTransform('')
    }

    updateCapability()
    mediaQuery.addEventListener('change', updateCapability)
    return () => mediaQuery.removeEventListener('change', updateCapability)
  }, [])

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    onPointerMove?.(event)
    if (!canTilt || event.pointerType !== 'mouse') return

    const bounds = cardRef.current?.getBoundingClientRect()
    if (!bounds) return

    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5
    const rotateX = vertical * maxTilt * -2
    const rotateY = horizontal * maxTilt * 2
    setTransform(`perspective(1100px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(0)`)
  }

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>): void => {
    onPointerLeave?.(event)
    setTransform('')
  }

  const cardStyle: CSSProperties = {
    ...style,
    transform: transform || style?.transform,
  }

  return (
    <div
      {...props}
      ref={cardRef}
      className={`profile-card-3d ${className}`.trim()}
      style={cardStyle}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </div>
  )
}
