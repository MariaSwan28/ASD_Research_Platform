export function requestLimit({ max = 30, windowMs = 15 * 60 * 1000 } = {}) {
  const buckets = new Map()
  return (req, res, next) => {
    const now = Date.now(), key = req.ip || 'unknown'
    let bucket = buckets.get(key)
    if (!bucket || now > bucket.until) {
      if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value)
      bucket = { count: 0, until: now + windowMs }; buckets.set(key, bucket)
    }
    if (++bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.until - now) / 1000))
      return res.status(429).json({ message: 'Слишком много запросов. Попробуйте позже.' })
    }
    next()
  }
}
