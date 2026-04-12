import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import PortfolioApp from './PortfolioApp'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PortfolioApp />} />
        <Route path="/archive" element={<Navigate to={{ pathname: '/', hash: 'archive' }} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
