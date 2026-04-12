/** Native wrapping; GSAP entrance uses `data-info-reveal`. */
export function ProjectInfoBody({ text, className }: { text: string; className?: string }) {
  return (
    <p className={className} data-info-reveal="block">
      {text}
    </p>
  )
}
