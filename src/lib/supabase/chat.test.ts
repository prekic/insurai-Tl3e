/**
 * Chat Persistence Service Tests
 *
 * Tests for conversation and message persistence in Supabase
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase client before imports
vi.mock('./client', () => ({
  supabase: {
    from: vi.fn(),
  },
  isSupabaseConfigured: vi.fn(() => true),
}))

import {
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  addMessage,
  getConversationMessages,
  saveExchange,
  getConversationTokenUsage,
  getRecentConversations,
} from './chat'
import { supabase, isSupabaseConfigured } from './client'

// Helper to create mock chain
const createMockChain = (finalResult: { data: unknown; error: unknown }) => ({
  insert: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(finalResult),
    }),
  }),
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(finalResult),
      order: vi.fn().mockResolvedValue(finalResult),
    }),
    order: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(finalResult),
    }),
  }),
  update: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(finalResult),
      }),
    }),
  }),
  delete: vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(finalResult),
  }),
})

describe('Chat Persistence Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isSupabaseConfigured).mockReturnValue(true)
  })

  describe('createConversation', () => {
    it('should create a conversation with default values', async () => {
      const mockConversation = {
        id: 'conv-123',
        user_id: 'user-123',
        title: 'New Conversation',
        provider: 'openai',
        policy_ids: [],
        message_count: 0,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const mockChain = createMockChain({ data: mockConversation, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await createConversation('user-123')

      expect(result).toEqual(mockConversation)
      expect(supabase.from).toHaveBeenCalledWith('chat_conversations')
    })

    it('should create a conversation with custom options', async () => {
      const mockConversation = {
        id: 'conv-123',
        user_id: 'user-123',
        title: 'My Chat',
        provider: 'anthropic',
        policy_ids: ['pol-1', 'pol-2'],
        message_count: 0,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const mockChain = createMockChain({ data: mockConversation, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await createConversation('user-123', {
        title: 'My Chat',
        provider: 'anthropic',
        policyIds: ['pol-1', 'pol-2'],
      })

      expect(result.provider).toBe('anthropic')
      expect(result.policy_ids).toEqual(['pol-1', 'pol-2'])
    })

    it('should throw error when Supabase insert fails', async () => {
      const mockChain = createMockChain({ data: null, error: { message: 'Insert failed' } })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      await expect(createConversation('user-123')).rejects.toThrow()
    })

    it('should throw when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      await expect(createConversation('user-123')).rejects.toThrow('Supabase is not configured')
    })
  })

  describe('getConversation', () => {
    it('should return null for non-existent conversation', async () => {
      const mockChain = createMockChain({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await getConversation('non-existent')
      expect(result).toBeNull()
    })

    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 'conv-123',
        user_id: 'user-123',
        title: 'Test Chat',
        provider: 'openai',
      }

      const mockChain = createMockChain({ data: mockConversation, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await getConversation('conv-123')
      expect(result).toEqual(mockConversation)
    })

    it('should return null when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      const result = await getConversation('conv-123')
      expect(result).toBeNull()
    })
  })

  describe('getRecentConversations', () => {
    it('should return empty array when no conversations', async () => {
      const mockChain = createMockChain({ data: [], error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await getRecentConversations()
      expect(result).toEqual([])
    })

    it('should return empty array when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      const result = await getRecentConversations()
      expect(result).toEqual([])
    })
  })

  describe('addMessage', () => {
    it('should add a user message', async () => {
      const mockMessage = {
        id: 'msg-123',
        conversation_id: 'conv-123',
        role: 'user',
        content: 'Hello, what is my coverage?',
        provider: null,
        token_usage: null,
        created_at: new Date().toISOString(),
      }

      const mockChain = createMockChain({ data: mockMessage, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await addMessage('conv-123', 'user', 'Hello, what is my coverage?')

      expect(result.role).toBe('user')
      expect(result.content).toBe('Hello, what is my coverage?')
    })

    it('should add an assistant message with token usage', async () => {
      const mockMessage = {
        id: 'msg-124',
        conversation_id: 'conv-123',
        role: 'assistant',
        content: 'Your coverage includes...',
        provider: 'openai',
        token_usage: { input_tokens: 50, output_tokens: 100 },
        created_at: new Date().toISOString(),
      }

      const mockChain = createMockChain({ data: mockMessage, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await addMessage('conv-123', 'assistant', 'Your coverage includes...', {
        provider: 'openai',
        tokenUsage: { input_tokens: 50, output_tokens: 100 },
      })

      expect(result.role).toBe('assistant')
      expect(result.provider).toBe('openai')
      expect(result.token_usage).toEqual({ input_tokens: 50, output_tokens: 100 })
    })

    it('should throw when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      await expect(addMessage('conv-123', 'user', 'test')).rejects.toThrow('Supabase is not configured')
    })
  })

  describe('getConversationMessages', () => {
    it('should return empty array when no messages', async () => {
      const mockChain = createMockChain({ data: [], error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await getConversationMessages('conv-123')
      expect(result).toEqual([])
    })

    it('should return empty array when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      const result = await getConversationMessages('conv-123')
      expect(result).toEqual([])
    })
  })

  describe('saveExchange', () => {
    it('should save both user and assistant messages', async () => {
      const userMsg = {
        id: 'msg-1',
        conversation_id: 'conv-123',
        role: 'user',
        content: 'What is my deductible?',
        created_at: new Date().toISOString(),
      }
      const aiMsg = {
        id: 'msg-2',
        conversation_id: 'conv-123',
        role: 'assistant',
        content: 'Your deductible is 500 TRY',
        provider: 'openai',
        token_usage: { input_tokens: 30, output_tokens: 20 },
        created_at: new Date().toISOString(),
      }

      // Mock chain that returns different results for each call
      let callCount = 0
      const mockChain = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => {
              callCount++
              return Promise.resolve({ data: callCount === 1 ? userMsg : aiMsg, error: null })
            }),
          }),
        }),
      }
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await saveExchange(
        'conv-123',
        'What is my deductible?',
        'Your deductible is 500 TRY',
        { provider: 'openai', tokenUsage: { input_tokens: 30, output_tokens: 20 } }
      )

      expect(result.userMsg.role).toBe('user')
      expect(result.aiMsg.role).toBe('assistant')
    })
  })

  describe('getConversationTokenUsage', () => {
    it('should calculate total token usage', async () => {
      const mockMessages = [
        { token_usage: { input_tokens: 50, output_tokens: 100 } },
        { token_usage: { input_tokens: 30, output_tokens: 80 } },
        { token_usage: null },
        { token_usage: { prompt_tokens: 40, completion_tokens: 60 } },
      ]

      const mockChain = createMockChain({ data: mockMessages, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await getConversationTokenUsage('conv-123')

      expect(result.input).toBe(120) // 50 + 30 + 40
      expect(result.output).toBe(240) // 100 + 80 + 60
      expect(result.total).toBe(360)
    })

    it('should return zeros for conversation with no token data', async () => {
      const mockChain = createMockChain({ data: [], error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await getConversationTokenUsage('conv-123')

      expect(result.input).toBe(0)
      expect(result.output).toBe(0)
      expect(result.total).toBe(0)
    })
  })

  describe('updateConversation', () => {
    it('should update conversation title', async () => {
      const mockUpdated = {
        id: 'conv-123',
        title: 'Updated Title',
        updated_at: new Date().toISOString(),
      }

      const mockChain = createMockChain({ data: mockUpdated, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      const result = await updateConversation('conv-123', { title: 'Updated Title' })
      expect(result.title).toBe('Updated Title')
    })

    it('should throw when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      await expect(updateConversation('conv-123', { title: 'Test' })).rejects.toThrow('Supabase is not configured')
    })
  })

  describe('deleteConversation', () => {
    it('should delete conversation without error', async () => {
      const mockChain = createMockChain({ data: null, error: null })
      vi.mocked(supabase.from).mockReturnValue(mockChain as never)

      await expect(deleteConversation('conv-123')).resolves.toBeUndefined()
    })

    it('should throw when Supabase is not configured', async () => {
      vi.mocked(isSupabaseConfigured).mockReturnValue(false)
      await expect(deleteConversation('conv-123')).rejects.toThrow('Supabase is not configured')
    })
  })
})

describe('Chat Types', () => {
  describe('ChatProvider type guard', () => {
    it('should validate openai as valid provider', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider('openai')).toBe(true)
    })

    it('should validate anthropic as valid provider', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider('anthropic')).toBe(true)
    })

    it('should reject invalid providers', async () => {
      const { isChatProvider } = await import('./types')
      expect(isChatProvider('gemini')).toBe(false)
      expect(isChatProvider('')).toBe(false)
      expect(isChatProvider(null)).toBe(false)
    })
  })

  describe('ChatMessageRole type guard', () => {
    it('should validate message roles', async () => {
      const { isChatMessageRole } = await import('./types')
      expect(isChatMessageRole('user')).toBe(true)
      expect(isChatMessageRole('assistant')).toBe(true)
      expect(isChatMessageRole('system')).toBe(true)
      expect(isChatMessageRole('admin')).toBe(false)
    })
  })
})
