import path from 'path'

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  uploadsDir: path.resolve(process.env.UPLOADS_DIR ?? './uploads'),
  isDev: (process.env.NODE_ENV ?? 'development') === 'development',
}
