import { DataTypes } from 'sequelize'
import User from '../models/User.js'
import ChildSpecialist from '../models/ChildSpecialist.js'

// Additive migration: no alter/force, data and ownership stay intact.
export async function migrateRoles(db) {
  const query = db.getQueryInterface()
  const tables = await query.showAllTables()
  if (tables.includes('Users')) {
    const schema = await query.describeTable('Users')
    if (!schema.role) await query.addColumn('Users', 'role', {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'parent'
    })
  }
  await User.sync()
  await ChildSpecialist.sync()
}
