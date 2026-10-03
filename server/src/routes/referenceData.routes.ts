import { Router } from 'express'
import { getActiveCategories, getActiveRelatedSystems } from '../services/referenceData.service'

const router = Router()

router.get('/categories', async (_req, res) => {
  try {
    const categories = await getActiveCategories()
    res.status(200).json(categories)
  } catch (err) {
    console.error('GET /api/categories failed', err)
    res.status(500).json({ error: 'Unable to load categories' })
  }
})

router.get('/related-systems', async (_req, res) => {
  try {
    const relatedSystems = await getActiveRelatedSystems()
    res.status(200).json(relatedSystems)
  } catch (err) {
    console.error('GET /api/related-systems failed', err)
    res.status(500).json({ error: 'Unable to load related systems' })
  }
})

export default router
