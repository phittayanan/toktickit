import express from 'express'
import cors from 'cors'
import referenceDataRoutes from './routes/referenceData.routes'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' })
})

app.use('/api', referenceDataRoutes)

export default app
