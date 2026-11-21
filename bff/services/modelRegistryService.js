import { mlHeaders } from './mlHeaders.js'
import fetch from 'node-fetch'

// Read-only ML capabilities; models are registered by trusted developers.
class ModelRegistryService {
  async listCapabilities () {
    const base = process.env.ML_API_URL || 'http://ml-service:5010'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(`${base}/api/capabilities`, { signal: controller.signal, headers: mlHeaders() })
      if (!response.ok) throw new Error(`ML registry HTTP ${response.status}`)
      return await response.json()
    } finally {
      clearTimeout(timer)
    }
  }
}

export const modelRegistryService = new ModelRegistryService()
