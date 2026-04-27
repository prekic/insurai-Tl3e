#!/usr/bin/env node
/**
 * Copy pdfjs-dist worker bundle into public/pdfjs/ so the app can serve it
 * from the same origin as a robust alternative to CDN fetches (which are
 * subject to CORS, third-party outages, and HEAD/GET asymmetries — see
 * pdf-parser.ts WORKER_CDN_SOURCES cascade and the runbook entry for
 * the worker fallback).
 *
 * Runs automatically via `postinstall` in package.json so the file stays in
 * lockstep with whatever pdfjs-dist version is installed. The output is
 * gitignored (1 MB binary; no need to commit a derived artifact).
 *
 * Idempotent: safe to re-run.
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

const SRC = join(projectRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs')
const DEST_DIR = join(projectRoot, 'public', 'pdfjs')
const DEST = join(DEST_DIR, 'pdf.worker.min.mjs')

if (!existsSync(SRC)) {
  // pdfjs-dist isn't installed yet (e.g. during `npm install` of a freshly
  // cloned tree before deps resolve). Bail silently — the next install pass
  // will run postinstall again with deps in place.
  process.stdout.write(
    `[copy-pdfjs-worker] skipped: ${SRC} not found (pdfjs-dist not installed yet)\n`
  )
  process.exit(0)
}

mkdirSync(DEST_DIR, { recursive: true })
copyFileSync(SRC, DEST)

const bytes = statSync(DEST).size
process.stdout.write(`[copy-pdfjs-worker] copied ${bytes} bytes → ${DEST}\n`)
