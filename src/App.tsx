import { BrowserRouter, Route, Routes } from 'react-router-dom'
import WaitingRoom from './pages/WaitingRoom'
import QueueTicket from './pages/QueueTicket'
import CouponIssuance from './pages/CouponIssuance'
import NotFound from './pages/NotFound'

// history 방식 라우팅. 해시 라우팅은 쓰지 않는다 (CLAUDE.md §3).
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WaitingRoom />} />
        <Route path="/queue" element={<QueueTicket />} />
        <Route path="/issue" element={<CouponIssuance />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
