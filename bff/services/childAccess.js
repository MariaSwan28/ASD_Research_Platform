import ChildProfile from '../models/ChildProfile.js'

// Все операции с материалами используют только профиль текущего пользователя.
export async function ownedChildId(userId, value) {
  if (!value) return null
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) return undefined
  const child = await ChildProfile.findOne({ where: { _id: value, ownerId: userId } })
  return child ? child._id : undefined
}
