import { mlHeaders } from './mlHeaders.js'
import fetch from 'node-fetch'

class MLservice {
  ML_API_URL = process.env.ML_API_URL || 'https://127.0.0.1:5010'

  async movment_analyze (userId, videoPath) {
    try {
      const response = await fetch(`${this.ML_API_URL}/api/mv_analyze`, {
        method: 'POST',
        headers: mlHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({
          user_id: userId,
          video_path: videoPath
        }),
        timeout: 600000
      })

      if (!response.ok) {
        throw new Error(
          `ML API error: ${response.status} ${response.statusText}`
        )
      }

      if (!response.ok) {
        throw new Error(
          `ML API error: ${response.status} ${response.statusText}`
        )
      }

      const data = await response.json()

      // Добавляем интерпретацию результата
      return {
        ...data,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.warn('ML movement_analyze failed:', error.message)

      // Возвращаем заглушку, если ML сервер недоступен
      return {
        error: error.message
      }
    }
  }

  async getStatus () {
    const response = await fetch(`${this.ML_API_URL}/api/mv_analyze/status`, { headers: mlHeaders() })
    return await response.json()
  }

  // Функция для получения предсказания от ML модели
  async getMLPrediction (userId, videoId) {
    const timeout = 5000 // 5 секунд

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${this.ML_API_URL}/api/predict`, {
        method: 'POST',
        headers: mlHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify({
          user_id: userId,
          video_name: videoId
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(
          `ML API error: ${response.status} ${response.statusText}`
        )
      }

      const data = await response.json()

      // Добавляем интерпретацию результата
      return {
        ...data,
        interpretation: this.interpretPrediction(data),
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.warn('ML prediction failed:', error.message)

      // Возвращаем заглушку, если ML сервер недоступен
      return {
        video_id: videoId,
        available: false,
        error: error.message,
        fallback_prediction: null
      }
    }
  }

  // Функция для интерпретации предсказания
  interpretPrediction (mlData) {
    const { prediction, confidence, probability_normal, probability_asd } =
      mlData

    return { class_label: mlData.prediction_label, confidence: mlData.confidence,
      probability_normal, probability_asd }
  }

  // Заглушка, если ML сервер недоступен
  getFallbackPrediction (videoId) {
    // Можно использовать данные из аналитики для простой оценки
    return { video_id: videoId, available: false, confidence: null }
  }
}

const mlService = new MLservice()
export { mlService }
