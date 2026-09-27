import { useEffect, useState } from 'react'

/** "14 dk önce" gibi göreli zamanlar için düzenli aralıkla yenilenen şimdi. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
