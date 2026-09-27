import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HashRouter } from 'react-router'
import { App } from './App'
import { settingQueryKey } from './lib/settings'
import { applyThemeClass } from './lib/theme'
import './styles/tokens.css'

// İlk boyamadan önce: ana süreç temayı DB'den okuyup preload üzerinden verdi.
applyThemeClass(window.api.initialTheme)

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
})
queryClient.setQueryData(settingQueryKey('theme'), window.api.initialTheme)

const root = document.getElementById('root')
if (!root) throw new Error('#root bulunamadı')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
