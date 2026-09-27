import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './app/AppShell'
import { AyarlarPage } from './features/ayarlar/AyarlarPage'
import { BilgiPage } from './features/bilgi/BilgiPage'
import { BugunPage } from './features/bugun/BugunPage'
import { DokumPage } from './features/dokum/DokumPage'
import { OkulPage } from './features/okul/OkulPage'
import { OnayPage } from './features/onay/OnayPage'
import { ProjelerPage } from './features/projeler/ProjelerPage'
import { TasarimPage } from './features/tasarim/TasarimPage'
import { ZihinPage } from './features/zihin/ZihinPage'
import { useSetting } from './lib/settings'
import { applyThemeClass } from './lib/theme'

export function App() {
  const theme = useSetting('theme')

  useEffect(() => {
    if (theme.data) applyThemeClass(theme.data)
  }, [theme.data])

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<BugunPage />} />
        <Route path="/dokum" element={<DokumPage />} />
        <Route path="/onay" element={<OnayPage />} />
        <Route path="/projeler" element={<ProjelerPage />} />
        <Route path="/okul" element={<OkulPage />} />
        <Route path="/zihin" element={<ZihinPage />} />
        <Route path="/bilgi/:noteId?" element={<BilgiPage />} />
        <Route path="/ayarlar" element={<AyarlarPage />} />
        {import.meta.env.DEV && <Route path="/tasarim" element={<TasarimPage />} />}
      </Route>
    </Routes>
  )
}
