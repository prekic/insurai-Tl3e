import { supabase } from './client'
import { isSupabaseConfigured } from './config'
import type {
  ChatConversationRow,
  ChatConversationInsert,
  ChatConversationUpdate,
  ChatMessageRow,
  ChatMessageInsert,
  ChatProvider,
  TokenUsage,
} from './types'

// =============================================================================
// CONVERSATION FUNCTIONS
// =============================================================================

/**
 * Create a new chat conversation
 */
export async function createConversation(
  userId: string,
  options?: {
    title?: string
    provider?: ChatProvider
    policyIds?: string[]
  }
): Promise<ChatConversationRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const insert: ChatConversationInsert = {
    user_id: userId,
    title: options?.title,
    provider: options?.provider || 'openai',
    policy_ids: options?.policyIds || [],
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert(insert)
    .select()
    .single()

  if (error) throw error
  return data as ChatConversationRow
}

/**
 * Get a conversation by ID
 */
export async function getConversation(conversationId: string): Promise<ChatConversationRow | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data as ChatConversationRow
}

/**
 * Get recent conversations for a user
 */
export async function getRecentConversations(limit: number = 20): Promise<ChatConversationRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as ChatConversationRow[]) || []
}

/**
 * Update a conversation
 */
export async function updateConversation(
  conversationId: string,
  updates: ChatConversationUpdate
): Promise<ChatConversationRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .select()
    .single()

  if (error) throw error
  return data as ChatConversationRow
}

/**
 * Delete a conversation (cascades to messages)
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw error
}

// =============================================================================
// MESSAGE FUNCTIONS
// =============================================================================

/**
 * Add a message to a conversation
 */
export async function addMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  options?: {
    provider?: string
    tokenUsage?: TokenUsage
  }
): Promise<ChatMessageRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const insert: ChatMessageInsert = {
    conversation_id: conversationId,
    role,
    content,
    provider: options?.provider || null,
    token_usage: options?.tokenUsage || null,
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert(insert)
    .select()
    .single()

  if (error) throw error
  return data as ChatMessageRow
}

/**
 * Get all messages for a conversation
 */
export async function getConversationMessages(
  conversationId: string
): Promise<ChatMessageRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data as ChatMessageRow[]) || []
}

/**
 * Get conversation with messages (convenience function)
 */
export async function getConversationWithMessages(
  conversationId: string
): Promise<{ conversation: ChatConversationRow; messages: ChatMessageRow[] } | null> {
  const conversation = await getConversation(conversationId)
  if (!conversation) return null

  const messages = await getConversationMessages(conversationId)
  return { conversation, messages }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a conversation and add initial system/assistant message
 */
export async function createConversationWithGreeting(
  userId: string,
  greetingMessage: string,
  options?: {
    provider?: ChatProvider
    policyIds?: string[]
  }
): Promise<{ conversation: ChatConversationRow; message: ChatMessageRow }> {
  const conversation = await createConversation(userId, {
    title: 'New Conversation',
    provider: options?.provider || 'openai',
    policyIds: options?.policyIds || [],
  })

  const message = await addMessage(conversation.id, 'assistant', greetingMessage)

  return { conversation, message }
}

/**
 * Save a complete exchange (user question + AI response)
 */
export async function saveExchange(
  conversationId: string,
  userMessage: string,
  aiResponse: string,
  options?: {
    provider?: string
    tokenUsage?: TokenUsage
  }
): Promise<{ userMsg: ChatMessageRow; aiMsg: ChatMessageRow }> {
  const userMsg = await addMessage(conversationId, 'user', userMessage)
  const aiMsg = await addMessage(conversationId, 'assistant', aiResponse, {
    provider: options?.provider,
    tokenUsage: options?.tokenUsage,
  })

  return { userMsg, aiMsg }
}

/**
 * Get or create a conversation for a user
 * Returns the most recent conversation or creates a new one
 */
export async function getOrCreateConversation(
  userId: string,
  options?: {
    provider?: ChatProvider
    policyIds?: string[]
    greetingMessage?: string
  }
): Promise<ChatConversationRow> {
  // Try to get the most recent conversation
  const recent = await getRecentConversations(1)
  if (recent.length > 0) {
    return recent[0]
  }

  // Create a new conversation
  if (options?.greetingMessage) {
    const { conversation } = await createConversationWithGreeting(
      userId,
      options.greetingMessage,
      { provider: options.provider, policyIds: options.policyIds }
    )
    return conversation
  }

  return createConversation(userId, {
    provider: options?.provider,
    policyIds: options?.policyIds,
  })
}

/**
 * Calculate total token usage for a conversation
 */
export async function getConversationTokenUsage(
  conversationId: string
): Promise<{ input: number; output: number; total: number }> {
  const messages = await getConversationMessages(conversationId)

  let input = 0
  let output = 0

  for (const msg of messages) {
    if (msg.token_usage) {
      input += msg.token_usage.input_tokens || msg.token_usage.prompt_tokens || 0
      output += msg.token_usage.output_tokens || msg.token_usage.completion_tokens || 0
    }
  }

  return { input, output, total: input + output }
}
