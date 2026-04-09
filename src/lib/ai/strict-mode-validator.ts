/**
 * Validates that a JSON schema conforms to OpenAI strict mode requirements.
 *
 * Strict mode requires:
 * - Every object's `properties` keys must ALL appear in `required[]`
 * - Every object must set `additionalProperties: false`
 *
 * This file is intentionally duplicated at `server/schemas/strict-mode-validator.ts`
 * because `server/tsconfig.json` (rootDir: ".") cannot import from `src/`.
 * Keep both copies in sync until schema unification lands.
 */
export function validateStrictCompliance(
  schema: Record<string, unknown>,
  path: string = 'root'
): string[] {
  const errors: string[] = []

  if (schema.type === 'object' && schema.properties) {
    const properties = Object.keys(schema.properties as Record<string, unknown>)
    const required = (schema.required as string[]) || []

    // Check all properties are in required
    for (const prop of properties) {
      if (!required.includes(prop)) {
        errors.push(`${path}.${prop} is not in required array`)
      }
    }

    // Check additionalProperties is false
    if (schema.additionalProperties !== false) {
      errors.push(`${path} does not have additionalProperties: false`)
    }

    // Recurse into nested object properties
    for (const [key, value] of Object.entries(schema.properties as Record<string, unknown>)) {
      const propSchema = value as Record<string, unknown>
      if (propSchema.type === 'object') {
        errors.push(...validateStrictCompliance(propSchema, `${path}.${key}`))
      }
    }
  }

  if (schema.type === 'array' && schema.items) {
    const itemSchema = schema.items as Record<string, unknown>
    if (itemSchema.type === 'object') {
      errors.push(...validateStrictCompliance(itemSchema, `${path}[]`))
    }
  }

  return errors
}
