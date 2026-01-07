/**
 * Configuration Validation Tests
 *
 * Validates that all configuration files are consistent
 * and environment variables are properly documented.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '../../..')

describe('Configuration Validation', () => {
  describe('Port Configuration', () => {
    it('should use port 4001 consistently across all config files', () => {
      const filesToCheck = [
        '.env.example',
        '.env.staging',
        'docker-compose.yml',
        'docker-compose.staging.yml',
        'Dockerfile',
        'docker/start.sh',
        'docker/nginx-fullstack.conf',
      ]

      const portErrors: string[] = []

      for (const file of filesToCheck) {
        const filePath = path.join(PROJECT_ROOT, file)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8')
          // Check for old port 3001 references
          if (content.includes(':3001') || content.includes('PORT=3001') || content.includes('port 3001')) {
            portErrors.push(`${file} contains references to port 3001`)
          }
        }
      }

      expect(portErrors).toEqual([])
    })

    it('should have API_PORT=4001 in .env.example', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example')
      const content = fs.readFileSync(envPath, 'utf-8')
      expect(content).toContain('API_PORT=4001')
    })

    it('should have VITE_API_PROXY_URL with port 4001 in .env.example', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example')
      const content = fs.readFileSync(envPath, 'utf-8')
      expect(content).toContain('localhost:4001')
    })
  })

  describe('Environment Variables', () => {
    it('should document all required frontend variables in .env.example', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example')
      const content = fs.readFileSync(envPath, 'utf-8')

      const requiredFrontendVars = [
        'VITE_SUPABASE_URL',
        'VITE_SUPABASE_ANON_KEY',
        'VITE_API_PROXY_URL',
      ]

      for (const varName of requiredFrontendVars) {
        expect(content).toContain(varName)
      }
    })

    it('should document all required backend variables in .env.example', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example')
      const content = fs.readFileSync(envPath, 'utf-8')

      const requiredBackendVars = [
        'API_PORT',
        'FRONTEND_URL',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
      ]

      for (const varName of requiredBackendVars) {
        expect(content).toContain(varName)
      }
    })

    it('should NOT have API keys with VITE_ prefix in .env.example', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example')
      const content = fs.readFileSync(envPath, 'utf-8')

      // These should NEVER have VITE_ prefix
      expect(content).not.toContain('VITE_OPENAI_API_KEY')
      expect(content).not.toContain('VITE_ANTHROPIC_API_KEY')
      expect(content).not.toContain('VITE_GOOGLE_CLOUD_API_KEY')
    })
  })

  describe('Docker Configuration', () => {
    it('should have matching ports in docker-compose.yml', () => {
      const composePath = path.join(PROJECT_ROOT, 'docker-compose.yml')
      const content = fs.readFileSync(composePath, 'utf-8')

      expect(content).toContain('"4001:4001"')
      expect(content).toContain('API_PORT=4001')
    })

    it('should have matching ports in docker-compose.staging.yml', () => {
      const composePath = path.join(PROJECT_ROOT, 'docker-compose.staging.yml')
      const content = fs.readFileSync(composePath, 'utf-8')

      expect(content).toContain('"4001:4001"')
      expect(content).toContain('API_PORT=4001')
    })

    it('should expose correct ports in Dockerfile', () => {
      const dockerfilePath = path.join(PROJECT_ROOT, 'Dockerfile')
      const content = fs.readFileSync(dockerfilePath, 'utf-8')

      // Backend stage
      expect(content).toContain('EXPOSE 4001')
      expect(content).toContain('ENV API_PORT=4001')

      // Fullstack stage
      expect(content).toContain('EXPOSE 80 4001')
    })

    it('should have correct upstream port in nginx-fullstack.conf', () => {
      const nginxPath = path.join(PROJECT_ROOT, 'docker/nginx-fullstack.conf')
      const content = fs.readFileSync(nginxPath, 'utf-8')

      expect(content).toContain('server 127.0.0.1:4001')
    })
  })

  describe('Database Migrations', () => {
    it('should have all required migration files', () => {
      const migrationsDir = path.join(PROJECT_ROOT, 'supabase/migrations')

      const requiredMigrations = [
        '001_initial_schema.sql',
        '002_storage_policies.sql',
        '003_security_fixes.sql',
        '004_chat_conversations.sql',
      ]

      for (const migration of requiredMigrations) {
        const migrationPath = path.join(migrationsDir, migration)
        expect(fs.existsSync(migrationPath)).toBe(true)
      }
    })

    it('should have valid SQL syntax in migrations (basic check)', () => {
      const migrationsDir = path.join(PROJECT_ROOT, 'supabase/migrations')
      const migrations = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))

      for (const migration of migrations) {
        const content = fs.readFileSync(path.join(migrationsDir, migration), 'utf-8')

        // Check for basic SQL structure
        expect(content.length).toBeGreaterThan(100)

        // Check for common SQL syntax errors
        expect(content).not.toContain(';;') // Double semicolons
        expect(content).not.toMatch(/CREATE\s+TABLE\s+\(/) // Missing IF NOT EXISTS or table name
      }
    })

    it('should have search_path security fix in all functions', () => {
      const migrationsDir = path.join(PROJECT_ROOT, 'supabase/migrations')

      // Check security fixes migration
      const securityPath = path.join(migrationsDir, '003_security_fixes.sql')
      const securityContent = fs.readFileSync(securityPath, 'utf-8')
      expect(securityContent).toContain("SET search_path = ''")

      // Check chat migration
      const chatPath = path.join(migrationsDir, '004_chat_conversations.sql')
      const chatContent = fs.readFileSync(chatPath, 'utf-8')
      expect(chatContent).toContain("SET search_path = ''")
    })

    it('should have RLS enabled on all user tables', () => {
      const migrationsDir = path.join(PROJECT_ROOT, 'supabase/migrations')

      // Check initial schema
      const schemaPath = path.join(migrationsDir, '001_initial_schema.sql')
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8')
      expect(schemaContent).toContain('ALTER TABLE policies ENABLE ROW LEVEL SECURITY')
      expect(schemaContent).toContain('ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY')

      // Check chat migration
      const chatPath = path.join(migrationsDir, '004_chat_conversations.sql')
      const chatContent = fs.readFileSync(chatPath, 'utf-8')
      expect(chatContent).toContain('ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY')
      expect(chatContent).toContain('ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY')
    })
  })

  describe('TypeScript Configuration', () => {
    it('should exclude test files from build', () => {
      const tsconfigPath = path.join(PROJECT_ROOT, 'tsconfig.json')
      const content = fs.readFileSync(tsconfigPath, 'utf-8')
      const config = JSON.parse(content)

      expect(config.exclude).toBeDefined()
      expect(config.exclude).toContain('src/**/*.test.ts')
      expect(config.exclude).toContain('src/**/*.test.tsx')
    })
  })
})
