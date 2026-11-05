import { join } from 'node:path'

// Paths the SPA catch-all must not answer, so unknown /api/* GETs 404 instead of returning index.html
export const STATIC_EXCLUDE = ['/api/{*path}', '/metrics']

export function staticOptions(rootPath = join(__dirname, '..', '..', 'frontend', 'dist')) {
  return { rootPath, exclude: STATIC_EXCLUDE }
}
