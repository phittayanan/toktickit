import { Router } from 'express'
import { sendValidationError } from '../apiError'
import type { SessionRequest } from '../middleware/requireSession'
import { staffQueueQuerySchema } from '../schemas/staffQueue.schema'
import { listEligibleOwners } from '../services/eligibleOwners.service'
import { listQueue } from '../services/staffQueue.service'

// api-spec.md §5 Staff Tickets. Mounted under /api/staff, after the
// session, password-change, and staff role checks (§1.5 steps 1 to 3).
const router = Router()

router.get('/tickets', async (req: SessionRequest, res) => {
  const parsed = staffQueueQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    sendValidationError(res, parsed.error)
    return
  }

  res.status(200).json(await listQueue(parsed.data, req.user!.id))
})

router.get('/eligible-owners', async (_req, res) => {
  res.status(200).json(await listEligibleOwners())
})

export default router
