import { modelRegistryService } from '../services/modelRegistryService.js'

const unavailableModels = [
  { id: 'movement-pose-v1', version: '1.0', modality: 'video', status: 'unavailable', reason: 'ML-сервис не отвечает' },
  { id: 'parent-story-nb', version: 'bachelor-2024-count-v1', modality: 'text', status: 'unavailable', reason: 'ML-сервис не отвечает' }
]

export const modelRegistryController = {
  async list (req, res) {
    // Catalog remains visible when the Python process starts slowly or is down.
    // Do not mark either model as ready without a successful live status check.
    try {
      return res.json(await modelRegistryService.listCapabilities())
    } catch (error) {
      console.warn('ML capabilities temporarily unavailable:', error.message)
      return res.json({ models: unavailableModels, serviceAvailable: false })
    }
  }
}
