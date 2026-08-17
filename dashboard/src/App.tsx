import { Route, Routes } from 'react-router'
import Overview from './pages/Overview'
import RoomStatsPage from './pages/RoomStats'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Overview />} />
      <Route path="/rooms/:id" element={<RoomStatsPage />} />
    </Routes>
  )
}
