import { DataTypes } from 'sequelize'
import File from '../models/File.js'
import { metadata } from './materialStorage.js'
export async function migrateStorage(db) {
  const query = db.getQueryInterface()
  const tables = await query.showAllTables()
  if (tables.includes('Files')) {
    const schema = await query.describeTable('Files')
    for (const key of ['mimeType', 'materialCategory']) if (!schema[key]) await query.addColumn('Files', key, { type: DataTypes.STRING, allowNull: true })
  }
  await db.sync()
  const files = await File.findAll()
  for (const file of files) if (file.type !== 'dir' && (!file.mimeType || !file.materialCategory)) await file.update(metadata(file.name))
}
