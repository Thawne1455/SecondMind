import { extendTailwindMerge } from 'tailwind-merge'

// tokens.css'teki özel adlar: tailwind-merge bunları bilmezse çakışmayı çözemez.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'bg',
        's2',
        's3',
        'line',
        'ink',
        'ink2',
        'ink3',
        'band',
        'on-ink',
        'hover',
        'indigo',
        't-coral',
        'amber',
        'green',
        'sky',
        'lilac',
        'lilac2',
        'teal',
        'coral',
        'orange',
        'pink',
        'fill-ink',
        'hm0',
        'hm1',
        'hm2',
        'hm3',
        'hm4',
      ],
      radius: ['modal', 'tile', 'field', 'block'],
    },
  },
})

/** Koşullu sınıf birleştirme; çakışan Tailwind sınıflarında sonraki kazanır (className ezebilir). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
