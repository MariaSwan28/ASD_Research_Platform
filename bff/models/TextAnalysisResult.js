import { Model, DataTypes } from 'sequelize'
import sequelize from '../DB/database.js'

class TextAnalysisResult extends Model {}
TextAnalysisResult.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  ownerId: { type: DataTypes.UUID, allowNull: false },
  childProfileId: { type: DataTypes.UUID, allowNull: true },
  fileId: { type: DataTypes.UUID, allowNull: false },
  modelId: { type: DataTypes.STRING, allowNull: false },
  modelVersion: { type: DataTypes.STRING, allowNull: false },
  resultJson: { type: DataTypes.TEXT, allowNull: false },
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { sequelize, modelName: 'TextAnalysisResult', timestamps: false })
export default TextAnalysisResult
