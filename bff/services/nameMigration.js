import { DataTypes } from 'sequelize'
import User from '../models/User.js'
import ChildProfile from '../models/ChildProfile.js'

export async function migrateNames(db) {
  const query = db.getQueryInterface()
  const tables = await query.showAllTables()
  for (const table of ['Users', 'ChildProfiles']) {
    if (!tables.includes(table)) continue
    const schema = await query.describeTable(table)
    if (!schema.fullName) await query.addColumn(table, 'fullName', {
      type: DataTypes.STRING(200), allowNull: false, defaultValue: ''
    })
  }
  await User.sync()
  await ChildProfile.sync()
}
