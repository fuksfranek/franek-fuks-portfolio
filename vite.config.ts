import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'

type UploadTarget = 'cover' | 'gallery' | 'video' | 'posters' | 'backgrounds' | 'archive'

const projectTargets = new Set<UploadTarget>(['cover', 'gallery', 'video', 'posters', 'backgrounds'])

function sanitizeSegment(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
}

function sanitizeProjectId(value: string) {
  return value.trim().replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase()
}

function publicUrlFor(parts: string[]) {
  return `/${parts.map((part) => encodeURIComponent(part)).join('/')}`
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'portfolio-content-upload',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'POST' || !req.url?.startsWith('/__content/upload')) {
            next()
            return
          }

          try {
            const requestUrl = new URL(req.url, 'http://localhost')
            const target = requestUrl.searchParams.get('target') as UploadTarget | null
            const projectId = sanitizeProjectId(requestUrl.searchParams.get('projectId') ?? '')
            const requestedName = sanitizeSegment(requestUrl.searchParams.get('filename') ?? 'asset')

            if (!target || (!projectTargets.has(target) && target !== 'archive')) {
              throw new Error('Invalid upload target.')
            }
            if (target !== 'archive' && !projectId) {
              throw new Error('Missing project id.')
            }

            const body = await readRequestBody(req)
            if (body.length === 0) {
              throw new Error('Uploaded file was empty.')
            }

            const publicParts =
              target === 'archive'
                ? ['images', 'archive']
                : ['images', 'projects', projectId, target]
            const targetDir = path.resolve(process.cwd(), 'public', ...publicParts)
            await mkdir(targetDir, { recursive: true })

            const ext = path.extname(requestedName)
            const base = sanitizeSegment(path.basename(requestedName, ext)) || 'asset'
            let filename = `${base}${ext}`
            let n = 2
            while (existsSync(path.join(targetDir, filename))) {
              filename = `${base}-${n}${ext}`
              n += 1
            }

            await writeFile(path.join(targetDir, filename), body)

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ src: publicUrlFor([...publicParts, filename]) }))
          } catch (error) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Upload failed.',
              }),
            )
          }
        })
      },
    },
  ],
})
