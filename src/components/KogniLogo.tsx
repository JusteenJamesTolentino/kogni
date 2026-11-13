interface KogniLogoProps {
  /** Rendered edge length in px; the asset is square. */
  size?: number
  className?: string
}

/** Kogni brand mark (brain + leaf logo on navy). Decorative; accessible text lives next to it. */
export default function KogniLogo({ size = 36, className = '' }: KogniLogoProps) {
  return (
    <img
      src="/kogni-logo.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-xl object-cover ${className}`}
      aria-hidden="true"
      draggable={false}
    />
  )
}
