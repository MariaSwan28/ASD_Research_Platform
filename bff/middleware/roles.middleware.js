export const requireRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Недостаточно прав для этого действия' })
  next()
}
// Avatar is an account setting; all other file operations are material access.
export const materialAccess = (req, res, next) => {
  if (req.path === '/avatar') return next()
  return requireRoles('parent', 'specialist')(req, res, next)
}
