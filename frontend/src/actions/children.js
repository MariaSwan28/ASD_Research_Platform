import axios from 'axios'
import { API_URL } from '../config'

const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
const endpoint = `${API_URL}/api/children`
export async function loadChildren() {
  const response = await axios.get(endpoint, { headers: headers() })
  return response.data
}
export async function createChild(data) {
  const response = await axios.post(endpoint, data, { headers: headers() })
  return response.data
}
export async function updateChild(id, data) {
  const response = await axios.patch(`${endpoint}/${encodeURIComponent(id)}`, data, { headers: headers() })
  return response.data
}
export async function deleteChild(id) {
  const response = await axios.delete(`${endpoint}/${encodeURIComponent(id)}`, { headers: headers() })
  return response.data
}
