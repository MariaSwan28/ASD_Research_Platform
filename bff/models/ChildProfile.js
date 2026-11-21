import { Model, DataTypes } from 'sequelize'
import sequelize from '../DB/database.js'
import User from './User.js'

class ChildProfile extends Model {}

ChildProfile.init({
  _id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false, references: { model: User, key: '_id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  birthDate: { type: DataTypes.DATEONLY, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true }
}, { sequelize, modelName: 'ChildProfile', timestamps: true })

export default ChildProfile
