import { DataTypes } from 'sequelize'
import User from '../models/User.js'
export async function migrateAdministration(db) {
  const query = db.getQueryInterface()
  const schema = await query.describeTable('Users')
  if (!schema.deletedAt) await query.addColumn('Users', 'deletedAt', { type: DataTypes.DATE, allowNull: true })
  await User.sync()
}
