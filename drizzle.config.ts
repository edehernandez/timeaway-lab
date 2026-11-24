// Purpose: drizzle-kit's configuration — migrations are generated from server/db/schema.ts into server/db/migrations (D-002).
import { defineConfig } from 'drizzle-kit'
export default defineConfig({ dialect: 'sqlite', schema: './server/db/schema.ts', out: './server/db/migrations' })
