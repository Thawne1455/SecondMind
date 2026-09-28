import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ParkBar } from './ParkBar'
import { projectKeys, useProjects } from './useProjects'

// Küresel park penceresi (Ctrl Alt P): kenarlıksız ayrı pencere, `#/park` yolu. Her gösterilişte
// projeler yenilenir ve alan temizlenir; iş bitince pencere gizlenir, odak önceki uygulamaya döner.
export function ParkWindow() {
  const client = useQueryClient()
  const projects = useProjects().data ?? []
  const [shown, setShown] = useState(0)

  useEffect(() => {
    return window.api.on('park:shown', () => {
      void client.invalidateQueries({ queryKey: projectKeys.list })
      setShown((n) => n + 1)
    })
  }, [client])

  return (
    <ParkBar
      key={shown}
      projects={projects}
      source="shortcut"
      onDone={() => void window.api.invoke('park:hide', undefined)}
      className="h-screen"
    />
  )
}
