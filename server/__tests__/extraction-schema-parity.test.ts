/**
 * Cross-file structural parity test for extraction schemas.
 *
 * Ensures that the client schema (src/lib/ai/extraction-schema.ts) and
 * the server schema (server/schemas/extraction-schema.ts) stay structurally
 * aligned on all correctness-critical dimensions.
 *
 * IMPORTANT: This file uses a cross-rootDir import (../../src/lib/ai/...).
 * Vitest's bundler resolver ignores tsconfig.rootDir, so this works at test
 * time. It would FAIL under `tsc -p server/tsconfig.json`, but that's safe
 * because server/tsconfig.json excludes __tests__/**. Do NOT use this import
 * pattern in non-test files. See CLAUDE.md gotcha about Vitest bundler
 * resolver ignoring tsconfig.rootDir.
 */

import { describe, it, expect } from 'vitest'
import { EXTRACTION_JSON_SCHEMA as CLIENT_SCHEMA } from '../../src/lib/ai/extraction-schema'
import { EXTRACTION_JSON_SCHEMA as SERVER_SCHEMA } from '../schemas/extraction-schema'
import { validateStrictCompliance } from '../schemas/strict-mode-validator'

describe('Extraction schema parity (client ↔ server)', () => {
  it('should have the same top-level property keys', () => {
    const clientKeys = Object.keys(CLIENT_SCHEMA.schema.properties).sort()
    const serverKeys = Object.keys(SERVER_SCHEMA.schema.properties).sort()
    expect(serverKeys).toEqual(clientKeys)
  })

  it('should have the same top-level required fields', () => {
    const clientRequired = [...CLIENT_SCHEMA.schema.required].sort()
    const serverRequired = [...SERVER_SCHEMA.schema.required].sort()
    expect(serverRequired).toEqual(clientRequired)
  })

  it('should have the same coverage item property keys', () => {
    const clientCovKeys = Object.keys(
      CLIENT_SCHEMA.schema.properties.coverages.items.properties
    ).sort()
    const serverCovKeys = Object.keys(
      SERVER_SCHEMA.schema.properties.coverages.items.properties
    ).sort()
    expect(serverCovKeys).toEqual(clientCovKeys)
  })

  it('should have the same coverage item required fields', () => {
    const clientCovReq = [...CLIENT_SCHEMA.schema.properties.coverages.items.required].sort()
    const serverCovReq = [...SERVER_SCHEMA.schema.properties.coverages.items.required].sort()
    expect(serverCovReq).toEqual(clientCovReq)
  })

  it('should have the same confidence property keys', () => {
    const clientConfKeys = Object.keys(CLIENT_SCHEMA.schema.properties.confidence.properties).sort()
    const serverConfKeys = Object.keys(SERVER_SCHEMA.schema.properties.confidence.properties).sort()
    expect(serverConfKeys).toEqual(clientConfKeys)
  })

  it('should have the same amendmentInfo property keys', () => {
    const clientAmendKeys = Object.keys(
      CLIENT_SCHEMA.schema.properties.amendmentInfo.properties
    ).sort()
    const serverAmendKeys = Object.keys(
      SERVER_SCHEMA.schema.properties.amendmentInfo.properties
    ).sort()
    expect(serverAmendKeys).toEqual(clientAmendKeys)
  })

  it('should have the same evidence property keys', () => {
    const clientEvidKeys = Object.keys(CLIENT_SCHEMA.schema.properties.evidence.properties).sort()
    const serverEvidKeys = Object.keys(SERVER_SCHEMA.schema.properties.evidence.properties).sort()
    expect(serverEvidKeys).toEqual(clientEvidKeys)
  })

  it('should have the same clauseGraph property keys', () => {
    const clientClauseKeys = Object.keys(
      CLIENT_SCHEMA.schema.properties.clauseGraph.properties
    ).sort()
    const serverClauseKeys = Object.keys(
      SERVER_SCHEMA.schema.properties.clauseGraph.properties
    ).sort()
    expect(serverClauseKeys).toEqual(clientClauseKeys)
  })

  it('should agree on currency description (no defaulting contradiction)', () => {
    const clientDesc = CLIENT_SCHEMA.schema.properties.currency.description
    const serverDesc = SERVER_SCHEMA.schema.properties.currency.description

    // Both must prohibit defaulting to TRY
    expect(clientDesc).toContain('DO NOT default')
    expect(serverDesc).toContain('DO NOT default')
    expect(serverDesc).not.toContain('Default to TRY')
  })

  it('should both pass strict mode compliance', () => {
    const clientErrors = validateStrictCompliance(CLIENT_SCHEMA.schema)
    const serverErrors = validateStrictCompliance(SERVER_SCHEMA.schema)

    expect(clientErrors).toHaveLength(0)
    expect(serverErrors).toHaveLength(0)
  })
})
