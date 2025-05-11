import { promises as fs } from 'fs'
import path from 'path'

export default defineEventHandler(async () => {
  const dir = path.resolve('public/avatars')
  const files = await fs.readdir(dir)
  // return only png / jpg files
  return files.filter(f => /\.(png|jpe?g|gif)$/i.test(f))
})