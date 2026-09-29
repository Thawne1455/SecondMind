import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './app/AppShell'
import { AyarlarPage } from './features/ayarlar/AyarlarPage'
import { BilgiPage } from './features/bilgi/BilgiPage'
import { BugunPage } from './features/bugun/BugunPage'
import { DokumPage } from './features/dokum/DokumPage'
import { CoursePage } from './features/okul/CoursePage'
import { ExamPrepPage } from './features/okul/ExamPrepPage'
import { GpaPage } from './features/okul/GpaPage'
import { OkulPage } from './features/okul/OkulPage'
import { OnayPage } from './features/onay/OnayPage'
import { ParkWindow } from './features/projeler/ParkWindow'
import { ProjectPage } from './features/projeler/ProjectPage'
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
      {/* Küresel park penceresi (Ctrl Alt P): ayrı, kenarlıksız pencere; kabuk yok. */}
      <Route path="/park" element={<ParkWindow />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<BugunPage />} />
        <Route path="/dokum" element={<DokumPage />} />
        <Route path="/onay" element={<OnayPage />} />
        <Route path="/projeler" element={<ProjelerPage />} />
        <Route path="/projeler/:projectId" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/gorevler" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/gorevler/playtest" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/yol-haritasi" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/notlar/:noteId?" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/dokumanlar/:docId?" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/gunluk" element={<ProjectPage />} />
        <Route path="/projeler/:projectId/varliklar" element={<ProjectPage />} />
        <Route path="/okul" element={<OkulPage />} />
        <Route path="/okul/gano" element={<GpaPage />} />
        <Route path="/okul/ders/:courseId/:tab?" element={<CoursePage />} />
        <Route path="/okul/sinav/:examId" element={<ExamPrepPage />} />
        <Route path="/zihin" element={<ZihinPage />} />
        <Route path="/bilgi/:noteId?" element={<BilgiPage />} />
        <Route path="/ayarlar" element={<AyarlarPage />} />
        {import.meta.env.DEV && <Route path="/tasarim" element={<TasarimPage />} />}
      </Route>
    </Routes>
  )
}
