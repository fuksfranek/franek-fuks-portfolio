import { TypographyRevealLines } from './TypographyRevealLines'

export function ProjectInfoBody({ text, className }: { text: string; className?: string }) {
  return <TypographyRevealLines as="p" variant="body" text={text} className={className} />
}
