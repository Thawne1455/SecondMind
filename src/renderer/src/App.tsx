import { useEffect } from 'react'
import { Route, Routes } from 'react-router'
import { Moon, Sun, TriangleAlert } from 'lucide-react'
import { useAppInfo } from './lib/app'
import { useSetSetting, useSetting } from './lib/settings'
import { applyThemeClass } from './lib/theme'

const THEME_LABEL = { light: 'açık', dark: 'koyu' } as const

const SWATCHES = ['bg-indigo', 'bg-amber', 'bg-green', 'bg-sky', 'bg-lilac', 'bg-teal', 'bg-coral']

// Aşama 0 geçici sayfası: köprü, DB ve tema uçtan uca çalışıyor mu? Aşama 1'de Bugün ile değişir.
function SetupCheck() {
  const theme = useSetting('theme')
  const setTheme = useSetSetting('theme')
  const info = useAppInfo()

  useEffect(() => {
    if (theme.data) applyThemeClass(theme.data)
  }, [theme.data])

  const next = theme.data === 'dark' ? 'light' : 'dark'
  const error = theme.error ?? setTheme.error ?? info.error

  return (
    <main className="flex min-h-screen flex-col gap-8 p-16">
      <h1 className="wide text-[64px] leading-[.95] font-black uppercase">İkinci beyin hazır</h1>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setTheme.mutate(next)}
          disabled={setTheme.isPending}
          className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-bold text-on-ink"
        >
          {next === 'dark' ? (
            <Moon size={18} strokeWidth={1.75} />
          ) : (
            <Sun size={18} strokeWidth={1.75} />
          )}
          {next === 'dark' ? 'Koyu temaya geç' : 'Açık temaya geç'}
        </button>
        <span className="cx text-ink3">
          DB&apos;deki tema · {theme.data ? THEME_LABEL[theme.data] : '…'}
        </span>
      </div>

      {info.data && (
        <div className="flex flex-col gap-1">
          <span className="cx text-ink3">Veri klasörü</span>
          <span className="x font-bold">{info.data.dataDir}</span>
          {info.data.dataDirOnOneDrive && (
            <span className="flex items-center gap-2 font-semibold text-t-coral">
              <TriangleAlert size={16} strokeWidth={1.75} />
              Bu klasör OneDrive ile senkronlanıyor, veritabanı bozulabilir. Başka bir yere taşı.
            </span>
          )}
          <span className="text-[13px] font-semibold text-ink3">Sürüm {info.data.version}</span>
        </div>
      )}

      {error && <p className="font-semibold text-t-coral">Hata: {String(error)}</p>}

      <div className="flex gap-3">
        {SWATCHES.map((c) => (
          <div key={c} className={`${c} size-16 rounded-tile`} />
        ))}
      </div>
    </main>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<SetupCheck />} />
    </Routes>
  )
}
