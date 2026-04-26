declare module '@blossom-carousel/core' {
  export type BlossomInstance = {
    snap: boolean
    hasOverflow: { x: boolean; y: boolean }
    init: () => void
    destroy: () => void
    prev: (behavior?: ScrollBehavior) => void
    next: (behavior?: ScrollBehavior) => void
  }

  export function Blossom(
    element: HTMLElement,
    options?: {
      repeat?: boolean
    },
  ): BlossomInstance
}

declare module '@blossom-carousel/core/style.css'

declare module '@blossom-carousel/react' {
  import type { ComponentPropsWithoutRef, ElementType, ReactElement, ReactNode, Ref } from 'react'

  export type BlossomCarouselHandle = {
    prev: (behavior?: ScrollBehavior) => void
    next: (behavior?: ScrollBehavior) => void
    element: HTMLElement | null
  }

  export type BlossomCarouselProps<T extends ElementType = 'div'> = {
    as?: T
    repeat?: boolean
    load?: 'conditional' | 'always'
    children?: ReactNode
  } & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children'>

  export function BlossomCarousel<T extends ElementType = 'div'>(
    props: BlossomCarouselProps<T> & { ref?: Ref<BlossomCarouselHandle> },
  ): ReactElement | null
}
