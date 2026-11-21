import { Model, DataTypes } from 'sequelize'
import sequelize from '../DB/database.js'

// New unified analysis history; legacy result tables remain intact.
class UnifiedAnalysisResult extends Model {}
UnifiedAnalysisResult.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  childProfileId: { type: DataTypes.UUID, allowNull: true },
  fileId: { type: DataTypes.UUID, allowNull: false },
  modelId: { type: DataTypes.STRING, allowNull: false },
  modelVersion: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'completed' },
  resultJson: { type: DataTypes.TEXT, allowNull: false },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'UnifiedAnalysisResult', timestamps: false })
export default UnifiedAnalysisResult
