export const normalizeFullName = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
export const validFullName = value => typeof value === 'string' && value.length >= 2 && value.length <= 200
