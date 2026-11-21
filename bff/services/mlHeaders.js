export const mlHeaders = (extra = {}) => ({ ...extra, ...(process.env.ML_INTERNAL_TOKEN ? { 'X-ML-Token': process.env.ML_INTERNAL_TOKEN } : {}) })
