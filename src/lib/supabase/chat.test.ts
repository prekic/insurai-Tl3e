/**
 * Chat Persistence Service Tests
 *
 * Comprehensive tests for conversation and message persistence in Supabase.
 * Covers all branches including error handling, null/undefined fallbacks,
 * conversation CRUD operations, message handling, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks - available inside vi.mock() factories (avoids TDZ errors)
// ---------------------------------------------------------------------------
const {
  mockIsSupabaseConfigured,
  mockSingle,
  mockLimit,
  mockOrder,
  mockEq,
  mockSelect,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockFrom,
} = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockLimit = vi.fn()
  const mockOrder = vi.fn()
  const mockEq = vi.fn()
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockDelete = vi.fn()
  const mockFrom = vi.fn()

  return {
    mockIsSupabaseConfigured: vi.fn(() => true),
    mockSingle,
    mockLimit,
    mockOrder,
    mockEq,
    mockSelect,
    mockInsert,
    mockUpdate,
    mockDelete,
    mockFrom,
  }
})

// ---------------------------------------------------------------------------
// vi.mock() - replace Supabase client module
// ---------------------------------------------------------------------------
vi.mock('./client', () => ({
  supabase: { from: mockFrom },
  isSupabaseConfigured: mockIsSupabaseConfigured,
}))

// ---------------------------------------------------------------------------
// Import the module under test (AFTER vi.mock)
// ---------------------------------------------------------------------------
import {
  createConversation,
  getConversation,
  getRecentConversations,
  updateConversation,
  deleteConversation,
  addMessage,
  getConversationMessages,
  getConversationWithMessages,
  createConversationWithGreeting,
  saveExchange,
  getOrCreateConversation,
  getConversationTokenUsage,
} from './chat'
import type { ChatConversationRow, ChatMessageRow } from './types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const CONVERSATION: ChatConversationRow = {
  id: 'conv-1',
  user_id: 'user-1',
  title: 'Test Conversation',
  provider: 'openai',
  policy_ids: ['pol-1'],
  message_count: 2,
  last_message_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const MESSAGE: ChatMessageRow = {
  id: 'msg-1',
  conversation_id: 'conv-1',
  role: 'user',
  content: 'Hello',
  provider: null,
  token_usage: null,
  created_at: '2026-01-01T00:00:00Z',
}

const AI_MESSAGE: ChatMessageRow = {
  id: 'msg-2',
  conversation_id: 'conv-1',
  role: 'assistant',
  content: 'Hi there!',
  provider: 'openai',
  token_usage: { input_tokens: 10, output_tokens: 20 },
  created_at: '2026-01-01T00:00:01Z',
}

// ---------------------------------------------------------------------------
// Chain helpers - wire up the Supabase fluent API mock chains
// ---------------------------------------------------------------------------

/**
 * from(table).insert(data).select().single() => { data, error }
 */
function setupInsertChain(result: { data: unknown; error: unknown }) {
  mockSingle.mockReturnValueOnce(result)
  mockSelect.mockReturnValueOnce({ single: mockSingle })
  mockInsert.mockReturnValueOnce({ select: mockSelect })
  mockFrom.mockReturnValueOnce({ insert: mockInsert })
}

/**
 * from(table).select('*').eq(col, val).single() => { data, error }
 */
function setupSelectSingleChain(result: { data: unknown; error: unknown }) {
  mockSingle.mockReturnValueOnce(result)
  mockEq.mockReturnValueOnce({ single: mockSingle })
  mockSelect.mockReturnValueOnce({ eq: mockEq })
  mockFrom.mockReturnValueOnce({ select: mockSelect })
}

/**
 * from(table).select('*').order(...).limit(...) => { data, error }
 */
function setupSelectListChain(result: { data: unknown; error: unknown }) {
  mockLimit.mockReturnValueOnce(result)
  mockOrder.mockReturnValueOnce({ limit: mockLimit })
  mockSelect.mockReturnValueOnce({ order: mockOrder })
  mockFrom.mockReturnValueOnce({ select: mockSelect })
}

/**
 * from(table).select('*').eq(col, val).order(...) => { data, error }
 */
function setupSelectEqOrderChain(result: { data: unknown; error: unknown }) {
  mockOrder.mockReturnValueOnce(result)
  mockEq.mockReturnValueOnce({ order: mockOrder })
  mockSelect.mockReturnValueOnce({ eq: mockEq })
  mockFrom.mockReturnValueOnce({ select: mockSelect })
}

/**
 * from(table).update(data).eq(col, val).select().single() => { data, error }
 */
function setupUpdateChain(result: { data: unknown; error: unknown }) {
  mockSingle.mockReturnValueOnce(result)
  const innerSelect = vi.fn().mockReturnValueOnce({ single: mockSingle })
  mockEq.mockReturnValueOnce({ select: innerSelect })
  mockUpdate.mockReturnValueOnce({ eq: mockEq })
  mockFrom.mockReturnValueOnce({ update: mockUpdate })
}

/**
 * from(table).delete().eq(col, val) => { error }
 */
function setupDeleteChain(result: { error: unknown }) {
  mockEq.mockReturnValueOnce(result)
  mockDelete.mockReturnValueOnce({ eq: mockEq })
  mockFrom.mockReturnValueOnce({ delete: mockDelete })
}

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  mockIsSupabaseConfigured.mockReturnValue(true)
})

// =============================================================================
// CONVERSATION FUNCTIONS
// =============================================================================

describe('createConversation', () => {
  it('creates a conversation with default options (no options arg)', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })

    const result = await createConversation('user-1')

    expect(mockFrom).toHaveBeenCalledWith('chat_conversations')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        title: undefined,
        provider: 'openai',   // options?.provider || 'openai'
        policy_ids: [],        // options?.policyIds || []
      })
    )
    expect(result).toEqual(CONVERSATION)
  })

  it('creates a conversation with custom title, provider, and policyIds', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })

    await createConversation('user-1', {
      title: 'My Chat',
      provider: 'anthropic',
      policyIds: ['pol-1', 'pol-2'],
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        title: 'My Chat',
        provider: 'anthropic',
        policy_ids: ['pol-1', 'pol-2'],
      })
    )
  })

  it('uses defaults when options object is empty (|| branches)', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })

    await createConversation('user-1', {})

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: undefined,
        provider: 'openai',
        policy_ids: [],
      })
    )
  })

  it('uses defaults when options is explicitly undefined', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })

    await createConversation('user-1', undefined)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: undefined,
        provider: 'openai',
        policy_ids: [],
      })
    )
  })

  it('uses defaults when provider is undefined but policyIds is set', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })

    await createConversation('user-1', { policyIds: ['p1'] })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        policy_ids: ['p1'],
      })
    )
  })

  it('throws when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    await expect(createConversation('user-1')).rejects.toThrow(
      'Supabase is not configured'
    )
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws on Supabase insert error', async () => {
    const dbError = { message: 'insert failed', code: '23505' }
    setupInsertChain({ data: null, error: dbError })

    await expect(createConversation('user-1')).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('getConversation', () => {
  it('returns a conversation by ID', async () => {
    setupSelectSingleChain({ data: CONVERSATION, error: null })

    const result = await getConversation('conv-1')

    expect(mockFrom).toHaveBeenCalledWith('chat_conversations')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('id', 'conv-1')
    expect(result).toEqual(CONVERSATION)
  })

  it('returns null when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    const result = await getConversation('conv-1')

    expect(result).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns null on PGRST116 (not found) error code', async () => {
    setupSelectSingleChain({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    })

    const result = await getConversation('conv-999')

    expect(result).toBeNull()
  })

  it('throws on non-PGRST116 Supabase errors', async () => {
    const dbError = { code: '42P01', message: 'relation does not exist' }
    setupSelectSingleChain({ data: null, error: dbError })

    await expect(getConversation('conv-1')).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('getRecentConversations', () => {
  it('returns recent conversations with default limit of 20', async () => {
    setupSelectListChain({ data: [CONVERSATION], error: null })

    const result = await getRecentConversations()

    expect(mockFrom).toHaveBeenCalledWith('chat_conversations')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockOrder).toHaveBeenCalledWith('last_message_at', { ascending: false })
    expect(mockLimit).toHaveBeenCalledWith(20)
    expect(result).toEqual([CONVERSATION])
  })

  it('passes custom limit argument', async () => {
    setupSelectListChain({ data: [CONVERSATION], error: null })

    await getRecentConversations(5)

    expect(mockLimit).toHaveBeenCalledWith(5)
  })

  it('returns empty array when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    const result = await getRecentConversations()

    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns empty array when data is null (|| [] fallback)', async () => {
    setupSelectListChain({ data: null, error: null })

    const result = await getRecentConversations()

    expect(result).toEqual([])
  })

  it('throws on Supabase error', async () => {
    const dbError = { message: 'query failed' }
    setupSelectListChain({ data: null, error: dbError })

    await expect(getRecentConversations()).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('updateConversation', () => {
  it('updates a conversation and includes updated_at timestamp', async () => {
    const updated = { ...CONVERSATION, title: 'Updated' }
    setupUpdateChain({ data: updated, error: null })

    const result = await updateConversation('conv-1', { title: 'Updated' })

    expect(mockFrom).toHaveBeenCalledWith('chat_conversations')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated',
        updated_at: expect.any(String),
      })
    )
    expect(mockEq).toHaveBeenCalledWith('id', 'conv-1')
    expect(result.title).toBe('Updated')
  })

  it('throws when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    await expect(
      updateConversation('conv-1', { title: 'Nope' })
    ).rejects.toThrow('Supabase is not configured')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws on Supabase update error', async () => {
    const dbError = { message: 'update failed' }
    setupUpdateChain({ data: null, error: dbError })

    await expect(
      updateConversation('conv-1', { title: 'Fail' })
    ).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('deleteConversation', () => {
  it('deletes a conversation successfully', async () => {
    setupDeleteChain({ error: null })

    await expect(deleteConversation('conv-1')).resolves.toBeUndefined()

    expect(mockFrom).toHaveBeenCalledWith('chat_conversations')
    expect(mockEq).toHaveBeenCalledWith('id', 'conv-1')
  })

  it('throws when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    await expect(deleteConversation('conv-1')).rejects.toThrow(
      'Supabase is not configured'
    )
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws on Supabase delete error', async () => {
    const dbError = { message: 'delete failed' }
    setupDeleteChain({ error: dbError })

    await expect(deleteConversation('conv-1')).rejects.toEqual(dbError)
  })
})

// =============================================================================
// MESSAGE FUNCTIONS
// =============================================================================

describe('addMessage', () => {
  it('adds a user message with default null options', async () => {
    setupInsertChain({ data: MESSAGE, error: null })

    const result = await addMessage('conv-1', 'user', 'Hello')

    expect(mockFrom).toHaveBeenCalledWith('chat_messages')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-1',
        role: 'user',
        content: 'Hello',
        provider: null,       // options?.provider || null
        token_usage: null,    // options?.tokenUsage || null
      })
    )
    expect(result).toEqual(MESSAGE)
  })

  it('adds an assistant message with provider and token usage', async () => {
    setupInsertChain({ data: AI_MESSAGE, error: null })

    const tokenUsage = { input_tokens: 10, output_tokens: 20 }
    const result = await addMessage('conv-1', 'assistant', 'Hi there!', {
      provider: 'openai',
      tokenUsage,
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        token_usage: tokenUsage,
      })
    )
    expect(result).toEqual(AI_MESSAGE)
  })

  it('uses null defaults when options is undefined', async () => {
    setupInsertChain({ data: MESSAGE, error: null })

    await addMessage('conv-1', 'user', 'Text', undefined)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: null,
        token_usage: null,
      })
    )
  })

  it('uses null defaults when options fields are undefined (empty obj)', async () => {
    setupInsertChain({ data: MESSAGE, error: null })

    await addMessage('conv-1', 'system', 'System prompt', {})

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: null,
        token_usage: null,
      })
    )
  })

  it('accepts system role', async () => {
    const sysMsg = { ...MESSAGE, role: 'system' as const, content: 'System' }
    setupInsertChain({ data: sysMsg, error: null })

    const result = await addMessage('conv-1', 'system', 'System')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'system' })
    )
    expect(result.role).toBe('system')
  })

  it('throws when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    await expect(addMessage('conv-1', 'user', 'Hi')).rejects.toThrow(
      'Supabase is not configured'
    )
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws on Supabase insert error', async () => {
    const dbError = { message: 'insert msg failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(addMessage('conv-1', 'user', 'Hi')).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('getConversationMessages', () => {
  it('returns messages in ascending order', async () => {
    setupSelectEqOrderChain({ data: [MESSAGE, AI_MESSAGE], error: null })

    const result = await getConversationMessages('conv-1')

    expect(mockFrom).toHaveBeenCalledWith('chat_messages')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockEq).toHaveBeenCalledWith('conversation_id', 'conv-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true })
    expect(result).toEqual([MESSAGE, AI_MESSAGE])
  })

  it('returns empty array when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    const result = await getConversationMessages('conv-1')

    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns empty array when data is null (|| [] fallback)', async () => {
    setupSelectEqOrderChain({ data: null, error: null })

    const result = await getConversationMessages('conv-1')

    expect(result).toEqual([])
  })

  it('throws on Supabase error', async () => {
    const dbError = { message: 'query failed' }
    setupSelectEqOrderChain({ data: null, error: dbError })

    await expect(getConversationMessages('conv-1')).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('getConversationWithMessages', () => {
  it('returns conversation and messages together', async () => {
    // getConversation: from().select().eq().single()
    setupSelectSingleChain({ data: CONVERSATION, error: null })
    // getConversationMessages: from().select().eq().order()
    setupSelectEqOrderChain({ data: [MESSAGE, AI_MESSAGE], error: null })

    const result = await getConversationWithMessages('conv-1')

    expect(result).toEqual({
      conversation: CONVERSATION,
      messages: [MESSAGE, AI_MESSAGE],
    })
  })

  it('returns null when conversation not found (PGRST116)', async () => {
    setupSelectSingleChain({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    })

    const result = await getConversationWithMessages('conv-999')

    expect(result).toBeNull()
    // Should not call getConversationMessages since conversation is null
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('returns null when Supabase is not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    const result = await getConversationWithMessages('conv-1')

    // getConversation returns null -> short-circuit
    expect(result).toBeNull()
  })

  it('propagates error from getConversation', async () => {
    const dbError = { code: '42P01', message: 'relation missing' }
    setupSelectSingleChain({ data: null, error: dbError })

    await expect(getConversationWithMessages('conv-1')).rejects.toEqual(dbError)
  })

  it('propagates error from getConversationMessages', async () => {
    setupSelectSingleChain({ data: CONVERSATION, error: null })
    const dbError = { message: 'messages query failed' }
    setupSelectEqOrderChain({ data: null, error: dbError })

    await expect(getConversationWithMessages('conv-1')).rejects.toEqual(dbError)
  })
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

describe('createConversationWithGreeting', () => {
  it('creates conversation with "New Conversation" title and adds greeting', async () => {
    // createConversation chain
    setupInsertChain({ data: CONVERSATION, error: null })
    // addMessage chain
    setupInsertChain({ data: AI_MESSAGE, error: null })

    const result = await createConversationWithGreeting('user-1', 'Welcome!')

    expect(result.conversation).toEqual(CONVERSATION)
    expect(result.message).toEqual(AI_MESSAGE)

    // First insert: conversation with 'New Conversation' title
    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'New Conversation',
        provider: 'openai',
        policy_ids: [],
      })
    )
    // Second insert: greeting message with role 'assistant'
    expect(mockInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        conversation_id: 'conv-1',
        role: 'assistant',
        content: 'Welcome!',
      })
    )
  })

  it('passes provider and policyIds through options', async () => {
    const convWithAnthropic = { ...CONVERSATION, provider: 'anthropic' as const }
    setupInsertChain({ data: convWithAnthropic, error: null })
    setupInsertChain({ data: AI_MESSAGE, error: null })

    await createConversationWithGreeting('user-1', 'Hello', {
      provider: 'anthropic',
      policyIds: ['pol-A'],
    })

    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'anthropic',
        policy_ids: ['pol-A'],
      })
    )
  })

  it('uses defaults when options is undefined (|| branches)', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })
    setupInsertChain({ data: AI_MESSAGE, error: null })

    await createConversationWithGreeting('user-1', 'Hello', undefined)

    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'openai',
        policy_ids: [],
      })
    )
  })

  it('uses defaults when options is empty object', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })
    setupInsertChain({ data: AI_MESSAGE, error: null })

    await createConversationWithGreeting('user-1', 'Hello', {})

    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'openai',
        policy_ids: [],
      })
    )
  })

  it('propagates error from createConversation', async () => {
    const dbError = { message: 'create failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(
      createConversationWithGreeting('user-1', 'Hi')
    ).rejects.toEqual(dbError)
  })

  it('propagates error from addMessage', async () => {
    setupInsertChain({ data: CONVERSATION, error: null })
    const dbError = { message: 'msg insert failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(
      createConversationWithGreeting('user-1', 'Hi')
    ).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('saveExchange', () => {
  it('saves user message and AI response in sequence', async () => {
    setupInsertChain({ data: MESSAGE, error: null })
    setupInsertChain({ data: AI_MESSAGE, error: null })

    const result = await saveExchange('conv-1', 'Hello', 'Hi there!')

    expect(result.userMsg).toEqual(MESSAGE)
    expect(result.aiMsg).toEqual(AI_MESSAGE)
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('passes provider and tokenUsage to the AI message only', async () => {
    setupInsertChain({ data: MESSAGE, error: null })
    setupInsertChain({ data: AI_MESSAGE, error: null })

    const tokenUsage = { input_tokens: 100, output_tokens: 50 }
    await saveExchange('conv-1', 'Question', 'Answer', {
      provider: 'anthropic',
      tokenUsage,
    })

    // First call: user message - no provider/tokenUsage in options
    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        role: 'user',
        content: 'Question',
        provider: null,
        token_usage: null,
      })
    )
    // Second call: AI message - with provider/tokenUsage
    expect(mockInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: 'assistant',
        content: 'Answer',
        provider: 'anthropic',
        token_usage: tokenUsage,
      })
    )
  })

  it('uses null defaults when options is undefined', async () => {
    setupInsertChain({ data: MESSAGE, error: null })
    setupInsertChain({ data: AI_MESSAGE, error: null })

    await saveExchange('conv-1', 'Q', 'A')

    // AI message should get null provider/token_usage
    expect(mockInsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        provider: null,
        token_usage: null,
      })
    )
  })

  it('propagates error from user message insert', async () => {
    const dbError = { message: 'user msg failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(saveExchange('conv-1', 'Q', 'A')).rejects.toEqual(dbError)
  })

  it('propagates error from AI message insert', async () => {
    setupInsertChain({ data: MESSAGE, error: null })
    const dbError = { message: 'ai msg failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(saveExchange('conv-1', 'Q', 'A')).rejects.toEqual(dbError)
  })
})

// ---------------------------------------------------------------------------

describe('getOrCreateConversation', () => {
  it('returns the most recent conversation if one exists', async () => {
    // getRecentConversations(1)
    setupSelectListChain({ data: [CONVERSATION], error: null })

    const result = await getOrCreateConversation('user-1')

    expect(result).toEqual(CONVERSATION)
    expect(mockLimit).toHaveBeenCalledWith(1)
    // Should NOT create a new conversation
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('creates conversation with greeting when no recent and greetingMessage provided', async () => {
    // getRecentConversations(1) -> empty
    setupSelectListChain({ data: [], error: null })
    // createConversationWithGreeting -> createConversation
    setupInsertChain({ data: CONVERSATION, error: null })
    // createConversationWithGreeting -> addMessage
    setupInsertChain({ data: AI_MESSAGE, error: null })

    const result = await getOrCreateConversation('user-1', {
      greetingMessage: 'Welcome!',
      provider: 'anthropic',
      policyIds: ['pol-1'],
    })

    expect(result).toEqual(CONVERSATION)
    // Verify the conversation was created with the right provider/policyIds
    expect(mockInsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        provider: 'anthropic',
        policy_ids: ['pol-1'],
      })
    )
  })

  it('creates a basic conversation when no recent and no greetingMessage', async () => {
    // getRecentConversations(1) -> empty
    setupSelectListChain({ data: [], error: null })
    // createConversation
    setupInsertChain({ data: CONVERSATION, error: null })

    const result = await getOrCreateConversation('user-1', {
      provider: 'openai',
      policyIds: ['pol-2'],
    })

    expect(result).toEqual(CONVERSATION)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        policy_ids: ['pol-2'],
      })
    )
  })

  it('creates a basic conversation when options is entirely undefined', async () => {
    // getRecentConversations(1) -> empty
    setupSelectListChain({ data: [], error: null })
    // createConversation with no options
    setupInsertChain({ data: CONVERSATION, error: null })

    const result = await getOrCreateConversation('user-1')

    expect(result).toEqual(CONVERSATION)
    // options?.provider -> undefined, options?.policyIds -> undefined
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        policy_ids: [],
      })
    )
  })

  it('creates a basic conversation when greetingMessage is undefined but other options set', async () => {
    // getRecentConversations(1) -> empty
    setupSelectListChain({ data: [], error: null })
    // Falls through to createConversation (no greetingMessage)
    setupInsertChain({ data: CONVERSATION, error: null })

    const result = await getOrCreateConversation('user-1', {
      provider: 'anthropic',
      policyIds: ['p1'],
      // greetingMessage is intentionally not set
    })

    expect(result).toEqual(CONVERSATION)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'anthropic',
        policy_ids: ['p1'],
      })
    )
  })

  it('propagates error from getRecentConversations', async () => {
    const dbError = { message: 'list failed' }
    setupSelectListChain({ data: null, error: dbError })

    await expect(getOrCreateConversation('user-1')).rejects.toEqual(dbError)
  })

  it('propagates error from createConversation path', async () => {
    setupSelectListChain({ data: [], error: null })
    const dbError = { message: 'create failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(getOrCreateConversation('user-1')).rejects.toEqual(dbError)
  })

  it('propagates error from createConversationWithGreeting path', async () => {
    setupSelectListChain({ data: [], error: null })
    const dbError = { message: 'create with greeting failed' }
    setupInsertChain({ data: null, error: dbError })

    await expect(
      getOrCreateConversation('user-1', { greetingMessage: 'Hi' })
    ).rejects.toEqual(dbError)
  })
})

// =============================================================================
// TOKEN USAGE CALCULATION
// =============================================================================

describe('getConversationTokenUsage', () => {
  it('sums input_tokens and output_tokens from multiple messages', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: { input_tokens: 10, output_tokens: 20 } },
      { ...AI_MESSAGE, token_usage: { input_tokens: 30, output_tokens: 40 } },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 40, output: 60, total: 100 })
  })

  it('falls back to prompt_tokens and completion_tokens', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: { prompt_tokens: 5, completion_tokens: 15 } },
      { ...AI_MESSAGE, token_usage: { prompt_tokens: 25, completion_tokens: 35 } },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 30, output: 50, total: 80 })
  })

  it('prefers input_tokens over prompt_tokens (|| short-circuit)', async () => {
    const msgs: ChatMessageRow[] = [
      {
        ...MESSAGE,
        token_usage: {
          input_tokens: 10,
          prompt_tokens: 999,
          output_tokens: 20,
          completion_tokens: 888,
        },
      },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 10, output: 20, total: 30 })
  })

  it('handles zero input_tokens falling through to prompt_tokens (0 is falsy)', async () => {
    const msgs: ChatMessageRow[] = [
      {
        ...MESSAGE,
        token_usage: {
          input_tokens: 0,
          prompt_tokens: 42,
          output_tokens: 0,
          completion_tokens: 99,
        },
      },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    // 0 || 42 || 0 = 42 ; 0 || 99 || 0 = 99
    expect(result).toEqual({ input: 42, output: 99, total: 141 })
  })

  it('handles messages with null token_usage (skips them)', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: null },
      { ...AI_MESSAGE, token_usage: { input_tokens: 10, output_tokens: 20 } },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 10, output: 20, total: 30 })
  })

  it('handles all messages with null token_usage', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: null },
      { ...AI_MESSAGE, token_usage: null },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 0, output: 0, total: 0 })
  })

  it('returns zeros when conversation has no messages', async () => {
    setupSelectEqOrderChain({ data: [], error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 0, output: 0, total: 0 })
  })

  it('handles empty token_usage object (all fields undefined -> fallback to 0)', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: {} },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    // undefined || undefined || 0 = 0 for both input and output
    expect(result).toEqual({ input: 0, output: 0, total: 0 })
  })

  it('handles partial token_usage (only input_tokens set)', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: { input_tokens: 50 } },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 50, output: 0, total: 50 })
  })

  it('handles partial token_usage (only completion_tokens set)', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: { completion_tokens: 75 } },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 0, output: 75, total: 75 })
  })

  it('accumulates across many messages with mixed token_usage formats', async () => {
    const msgs: ChatMessageRow[] = [
      { ...MESSAGE, token_usage: { input_tokens: 50, output_tokens: 100 } },
      { ...AI_MESSAGE, token_usage: null },
      { ...MESSAGE, id: 'msg-3', token_usage: { prompt_tokens: 40, completion_tokens: 60 } },
      { ...AI_MESSAGE, id: 'msg-4', token_usage: {} },
    ]
    setupSelectEqOrderChain({ data: msgs, error: null })

    const result = await getConversationTokenUsage('conv-1')

    expect(result.input).toBe(90)   // 50 + 0 + 40 + 0
    expect(result.output).toBe(160) // 100 + 0 + 60 + 0
    expect(result.total).toBe(250)
  })

  it('returns zeros when Supabase not configured (getConversationMessages returns [])', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false)

    const result = await getConversationTokenUsage('conv-1')

    expect(result).toEqual({ input: 0, output: 0, total: 0 })
  })

  it('propagates error from getConversationMessages', async () => {
    const dbError = { message: 'messages query failed' }
    setupSelectEqOrderChain({ data: null, error: dbError })

    await expect(getConversationTokenUsage('conv-1')).rejects.toEqual(dbError)
  })
})

// =============================================================================
// CHAT TYPES (type guards from types.ts)
// =============================================================================

describe('Chat Types', () => {
  describe('isChatProvider', () => {
    it('validates openai as valid provider', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider('openai')).toBe(true)
    })

    it('validates anthropic as valid provider', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider('anthropic')).toBe(true)
    })

    it('rejects invalid provider strings', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider('gemini')).toBe(false)
      expect(isChatProvider('')).toBe(false)
    })

    it('rejects non-string values', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider(null)).toBe(false)
      expect(isChatProvider(undefined)).toBe(false)
      expect(isChatProvider(42)).toBe(false)
      expect(isChatProvider(true)).toBe(false)
    })
  })

  describe('isChatMessageRole', () => {
    it('validates all three roles', async () => {
      const { isChatMessageRole } = await import('./types')
      expect(isChatMessageRole('user')).toBe(true)
      expect(isChatMessageRole('assistant')).toBe(true)
      expect(isChatMessageRole('system')).toBe(true)
    })

    it('rejects invalid roles', async () => {
      const { isChatMessageRole } = await import('./types')
      expect(isChatMessageRole('admin')).toBe(false)
      expect(isChatMessageRole('')).toBe(false)
      expect(isChatMessageRole(null)).toBe(false)
      expect(isChatMessageRole(123)).toBe(false)
    })
  })
})
