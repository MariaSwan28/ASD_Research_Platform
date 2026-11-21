import { Model, DataTypes } from 'sequelize'
import sequelize from '../DB/database.js'

class AnalysisRecord extends Model {}
AnalysisRecord.init({
  _id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  childProfileId: { type: DataTypes.UUID, allowNull: true },
  fileId: { type: DataTypes.UUID, allowNull: false },
  modelId: { type: DataTypes.STRING, allowNull: false, defaultValue: 'movement-video' },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'completed' },
  completedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'AnalysisRecord', timestamps: false })
export default AnalysisRecord
