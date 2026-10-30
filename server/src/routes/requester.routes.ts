import { Router } from 'express'
import type { SessionRequest } from '../middleware/requireSession'
import { requesterDashboard } from '../services/dashboard.service'

// Lab 4 api-spec.md §5.1. Mounted under /api/requester, after the session,
// password-change, and Requester role checks.
const router = Router()

router.get('/dashboard', async (req: SessionRequest, res) => {
  res.status(200).json(await requesterDashboard(req.user!.id))
})

export default router
