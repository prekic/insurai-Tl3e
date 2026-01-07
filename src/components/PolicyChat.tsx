import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send,
  Bot,
  User,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  MessageSquarePlus,
  History,
  ChevronDown,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { usePolicies } from '@/lib/policy-context'
import { useAuth } from '@/lib/supabase/auth-context'
import { sanitizeMessage } from '@/lib/sanitize'
import {
  createConversation,
  getRecentConversations,
  getConversationMessages,
  addMessage,
  saveExchange,
} from '@/lib/supabase/chat'
import type { ChatConversationRow, ChatMessageRow, ChatProvider, TokenUsage } from '@/lib/supabase/types'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
  retryPayload?: string
}

interface ChatApiResponse {
  success: boolean
  response: string
  provider: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    input_tokens?: number
    output_tokens?: number
  }
}

interface ChatApiError {
  error: string
  code: string
  details?: string
}

const PROVIDER_INFO = {
  openai: {
    name: 'GPT-4o Mini',
    icon: '🤖',
    description: 'Fast and cost-effective',
  },
  anthropic: {
    name: 'Claude Haiku',
    icon: '🧠',
    description: 'Nuanced understanding',
  },
} as const

export function PolicyChat() {
  const navigate = useNavigate()
  const { policies } = usePolicies()
  const { user } = useAuth()

  // Provider state
  const [selectedProvider, setSelectedProvider] = useState<ChatProvider>('openai')
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)

  // Conversation state
  const [currentConversation, setCurrentConversation] = useState<ChatConversationRow | null>(null)
  const [conversations, setConversations] = useState<ChatConversationRow[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I'm your AI insurance assistant. I can help you understand your ${policies.length} uploaded policies. Ask me anything about your coverage, compare policies, or get recommendations.`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const providerDropdownRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(event.target as Node)) {
        setShowProviderDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Load conversation history on mount
  /* eslint-disable react-hooks/exhaustive-deps -- intentionally only runs when user changes */
  useEffect(() => {
    if (user) {
      loadConversationHistory()
    }
  }, [user])
  /* eslint-enable react-hooks/exhaustive-deps */

  const loadConversationHistory = async () => {
    if (!user) return
    setIsLoadingHistory(true)
    try {
      const recent = await getRecentConversations(20)
      setConversations(recent)
    } catch (error) {
      console.error('Failed to load conversation history:', error)
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const loadConversation = async (conversation: ChatConversationRow) => {
    try {
      const msgs = await getConversationMessages(conversation.id)
      const formattedMessages: Message[] = msgs.map((m: ChatMessageRow) => ({
        id: m.id,
        role: m.role === 'system' ? 'assistant' : m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.created_at),
      }))

      // Add initial greeting if no messages
      if (formattedMessages.length === 0) {
        formattedMessages.push({
          id: '1',
          role: 'assistant',
          content: `Hello! I'm your AI insurance assistant. I can help you understand your ${policies.length} uploaded policies.`,
          timestamp: new Date(),
        })
      }

      setMessages(formattedMessages)
      setCurrentConversation(conversation)
      setSelectedProvider(conversation.provider)
      setShowHistory(false)
    } catch (error) {
      console.error('Failed to load conversation:', error)
      toast.error('Failed to load conversation')
    }
  }

  const startNewConversation = async () => {
    if (!user) {
      // For guests, just reset local state
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: `Hello! I'm your AI insurance assistant. I can help you understand your ${policies.length} uploaded policies.`,
          timestamp: new Date(),
        },
      ])
      setCurrentConversation(null)
      setShowHistory(false)
      return
    }

    try {
      const policyIds = policies.map((p) => p.id).filter(Boolean) as string[]
      const conversation = await createConversation(user.id, {
        provider: selectedProvider,
        policyIds,
      })

      // Add initial greeting to the new conversation
      const greetingContent = `Hello! I'm your AI insurance assistant. I can help you understand your ${policies.length} uploaded policies.`
      await addMessage(conversation.id, 'assistant', greetingContent)

      setCurrentConversation(conversation)
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: greetingContent,
          timestamp: new Date(),
        },
      ])
      setShowHistory(false)

      // Refresh history
      loadConversationHistory()
    } catch (error) {
      console.error('Failed to create conversation:', error)
      // Fall back to local-only mode
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: `Hello! I'm your AI insurance assistant. I can help you understand your ${policies.length} uploaded policies.`,
          timestamp: new Date(),
        },
      ])
      setCurrentConversation(null)
    }
  }

  // Build policy context from uploaded policies for the AI
  const policyContext = useMemo(() => {
    if (policies.length === 0) return undefined

    return policies
      .map((p) => {
        const parts = [
          `Policy: ${p.policyNumber || 'Unknown'}`,
          `Provider: ${p.provider || 'Unknown'}`,
          `Type: ${p.type || 'Unknown'}`,
        ]
        if (p.premium) parts.push(`Premium: ${p.premium} TRY`)
        if (p.startDate) parts.push(`Effective: ${p.startDate}`)
        if (p.expiryDate) parts.push(`Expires: ${p.expiryDate}`)
        if (p.coverages && p.coverages.length > 0) {
          parts.push(`Coverages: ${p.coverages.map((c) => c.name).join(', ')}`)
        }
        return parts.join('\n')
      })
      .join('\n\n')
  }, [policies])

  // Get conversation history for API (excluding error messages and the initial greeting)
  const getConversationHistory = useCallback((): Array<{ role: 'user' | 'assistant'; content: string }> => {
    return messages
      .filter((m) => m.role !== 'error' && m.id !== '1')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
  }, [messages])

  const getAIResponse = async (question: string): Promise<{ response: string; provider: string; usage?: TokenUsage }> => {
    const apiUrl = import.meta.env.VITE_API_PROXY_URL || ''
    const conversationHistory = getConversationHistory()

    const response = await fetch(`${apiUrl}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: question,
        conversationHistory,
        policyContext,
        provider: selectedProvider,
      }),
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as ChatApiError
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const data = (await response.json()) as ChatApiResponse
    if (!data.success || !data.response) {
      throw new Error('Invalid response from chat API')
    }

    return {
      response: data.response,
      provider: data.provider,
      usage: data.usage,
    }
  }

  const handleSend = async (messageToSend?: string) => {
    const rawQuestion = messageToSend || input.trim()
    if (!rawQuestion) return

    const question = sanitizeMessage(rawQuestion)
    if (!question) return

    setConnectionError(false)

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    try {
      const { response, provider, usage } = await getAIResponse(question)

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])

      // Persist to database if user is authenticated and has a conversation
      if (user && currentConversation) {
        try {
          await saveExchange(currentConversation.id, question, response, {
            provider,
            tokenUsage: usage,
          })
        } catch (error) {
          console.error('Failed to persist message:', error)
        }
      }
    } catch (error) {
      console.error('Chat error:', error)

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'error',
        content: "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date(),
        retryPayload: question,
      }

      setMessages((prev) => [...prev, errorMessage])
      setConnectionError(true)

      toast.error('Message failed', {
        description: 'There was a problem connecting to the AI assistant.',
        action: {
          label: 'Retry',
          onClick: () => handleRetry(question),
        },
      })
    } finally {
      setIsTyping(false)
    }
  }

  const handleRetry = async (question: string) => {
    setMessages((prev) => prev.filter((m) => m.role !== 'error' || m.retryPayload !== question))
    await handleSend(question)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleProviderChange = (provider: ChatProvider) => {
    setSelectedProvider(provider)
    setShowProviderDropdown(false)
    toast.success(`Switched to ${PROVIDER_INFO[provider].name}`)
  }

  const quickQuestions = [
    'What does my Kasko cover?',
    'Compare my policies',
    'Any coverage gaps?',
    'Renewal reminders',
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <Bot className="text-white" size={20} />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900">Policy Assistant</h1>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500">{policies.length} policies loaded</p>
                  {connectionError && (
                    <span className="text-xs text-red-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                      Connection issue
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Provider Selector */}
            <div className="relative" ref={providerDropdownRef}>
              <button
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                aria-label="Select AI provider"
                data-testid="provider-selector"
              >
                <Sparkles size={16} className="text-purple-600" />
                <span className="hidden sm:inline">{PROVIDER_INFO[selectedProvider].name}</span>
                <ChevronDown size={16} className={`transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showProviderDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                    AI Provider
                  </div>
                  {(Object.keys(PROVIDER_INFO) as ChatProvider[]).map((provider) => (
                    <button
                      key={provider}
                      onClick={() => handleProviderChange(provider)}
                      className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                        selectedProvider === provider ? 'bg-purple-50' : ''
                      }`}
                      data-testid={`provider-option-${provider}`}
                    >
                      <span className="text-xl">{PROVIDER_INFO[provider].icon}</span>
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{PROVIDER_INFO[provider].name}</div>
                        <div className="text-xs text-gray-500">{PROVIDER_INFO[provider].description}</div>
                      </div>
                      {selectedProvider === provider && (
                        <div className="ml-auto w-2 h-2 bg-purple-600 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* History Button */}
            {user && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
                aria-label="Conversation history"
                data-testid="history-button"
              >
                <History size={20} />
                {conversations.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 text-white text-xs rounded-full flex items-center justify-center">
                    {conversations.length > 9 ? '9+' : conversations.length}
                  </span>
                )}
              </button>
            )}

            {/* New Conversation Button */}
            <button
              onClick={startNewConversation}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="New conversation"
              data-testid="new-conversation-button"
            >
              <MessageSquarePlus size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && user && (
        <div className="absolute right-0 top-16 w-80 h-[calc(100vh-4rem)] bg-white border-l border-gray-200 shadow-lg z-40 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Conversation History</h2>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 hover:bg-gray-100 rounded"
              aria-label="Close history"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoadingHistory ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No conversations yet</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv)}
                    className={`w-full p-4 text-left hover:bg-gray-50 transition-colors ${
                      currentConversation?.id === conv.id ? 'bg-purple-50' : ''
                    }`}
                    data-testid={`conversation-${conv.id}`}
                  >
                    <div className="font-medium text-gray-900 truncate">{conv.title}</div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span>{PROVIDER_INFO[conv.provider].icon}</span>
                      <span>{conv.message_count} messages</span>
                      <span>·</span>
                      <span>{new Date(conv.last_message_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-700 text-sm">
              <AlertTriangle size={16} />
              <span>Having trouble connecting to the AI assistant</span>
            </div>
            <button
              onClick={() => setConnectionError(false)}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => {
            const retryPayload = message.retryPayload
            return (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Bot className="text-white" size={16} />
                  </div>
                )}
                {message.role === 'error' && (
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="text-red-600" size={16} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] p-4 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : message.role === 'error'
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-white border border-gray-200'
                  }`}
                >
                  <p
                    className={
                      message.role === 'user'
                        ? 'text-white'
                        : message.role === 'error'
                          ? 'text-red-700'
                          : 'text-gray-700'
                    }
                  >
                    {message.content}
                  </p>
                  {message.role === 'error' && retryPayload && (
                    <button
                      onClick={() => handleRetry(retryPayload)}
                      className="mt-2 flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      <RefreshCw size={14} />
                      Retry
                    </button>
                  )}
                  <p
                    className={`text-xs mt-2 ${
                      message.role === 'user'
                        ? 'text-blue-200'
                        : message.role === 'error'
                          ? 'text-red-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                    <User className="text-white" size={16} />
                  </div>
                )}
              </div>
            )
          })}

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Bot className="text-white" size={16} />
              </div>
              <div className="bg-white border border-gray-200 p-4 rounded-2xl">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Questions */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap gap-2 mb-4">
            {quickQuestions.map((question, i) => (
              <button
                key={i}
                onClick={() => setInput(question)}
                disabled={isTyping}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-sm text-gray-700 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about your policies..."
              disabled={isTyping}
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:bg-gray-50"
            />
            <Button onClick={() => handleSend()} disabled={isTyping || !input.trim()} className="gap-2">
              {isTyping ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="hidden sm:inline">Sending...</span>
                </>
              ) : (
                <>
                  <Send size={18} />
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
