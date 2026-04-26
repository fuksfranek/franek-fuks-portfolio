import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import PortfolioApp from './PortfolioApp'

const ContentEditor = import.meta.env.DEV
  ? lazy(() => import('./components/ContentEditor').then((module) => ({ default: module.ContentEditor })))
  : null

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PortfolioApp />} />
        <Route path="/archive" element={<Navigate to={{ pathname: '/', hash: 'archive' }} replace />} />
        {ContentEditor ? (
          <Route
            path="/content"
            element={
              <Suspense fallback={null}>
                <ContentEditor />
              </Suspense>
            }
          />
        ) : null}
      </Routes>
    </BrowserRouter>
  )
}
