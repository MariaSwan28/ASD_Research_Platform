import { ApiError } from '../exceptions/apiError.js'
import { tokenService } from '../services/tokenService.js'
import User from '../models/User.js'

const authMiddleware = async (req, res, next) => {
  try {
    const authorizationHeader = req.headers.authorization
    if (!authorizationHeader) {
      return next(ApiError.UnauthorizedError())
    }

    const accessToken = authorizationHeader.split(' ')[1]
    if (!accessToken) {
      return next(ApiError.UnauthorizedError())
    }

    const userData = tokenService.validateAccessToken(accessToken)
    if (!userData) {
      return next(ApiError.UnauthorizedError())
    }

    // Read current role from DB: grants/revocations apply to existing JWTs too.
    const account = await User.findByPk(userData.id, { attributes: ['_id', 'email', 'role', 'deletedAt'] })
    if (!account || account.deletedAt || !['parent', 'specialist', 'admin'].includes(account.role)) return next(ApiError.UnauthorizedError())
    req.user = { id: account._id, email: account.email, role: account.role }
    next()
  } catch (e) {
    return next(ApiError.UnauthorizedError())
  }
}

export { authMiddleware }
