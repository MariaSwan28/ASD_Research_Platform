import { Model, DataTypes } from 'sequelize'
import sequelize from '../DB/database.js'
import User from './User.js'
import ChildProfile from './ChildProfile.js'

class ChildSpecialist extends Model {}
ChildSpecialist.init({
  childId: { type: DataTypes.UUID, primaryKey: true, references: { model: ChildProfile, key: '_id' }, onDelete: 'CASCADE' },
  specialistId: { type: DataTypes.UUID, primaryKey: true, references: { model: User, key: '_id' }, onDelete: 'CASCADE' },
  assignedBy: { type: DataTypes.UUID, allowNull: false, references: { model: User, key: '_id' } }
}, { sequelize, modelName: 'ChildSpecialist', timestamps: true })
export default ChildSpecialist
