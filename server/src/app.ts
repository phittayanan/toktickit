import express from 'express'
import cors from 'cors'
import prisma from './prisma'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' })
})

app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    })
    res.status(200).json(categories)
  } catch (err) {
    console.error('GET /api/categories failed', err)
    res.status(500).json({ error: 'Unable to load categories' })
  }
})

export default app
