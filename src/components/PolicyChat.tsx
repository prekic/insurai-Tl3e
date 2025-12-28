import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Bot, User, ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { usePolicies } from '@/lib/policy-context'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  timestamp: Date
  retryPayload?: string // Store the original question for retry
}

export function PolicyChat() {
  const navigate = useNavigate()
  const { policies } = usePolicies()

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const getAIResponse = async (_question: string): Promise<string> => {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // Simulate random failure (10% chance for demo)
    if (Math.random() < 0.1) {
      throw new Error('Failed to get AI response')
    }

    // In a real implementation, _question would be sent to the AI API
    const responses = [
      'Based on your uploaded policies, your Kasko coverage from Allianz provides comprehensive protection including collision, theft, and natural disaster coverage.',
      'Looking at your portfolio, I notice your health insurance policy from Mapfre is expiring soon. Would you like me to help you compare renewal options?',
      'Your current policies provide a total coverage of over 2 million TL across different insurance lines. The average premium you\'re paying is competitive with market rates.',
      'I can see you have both mandatory traffic insurance and comprehensive Kasko. This is a good combination for complete vehicle protection.',
    ]

    return responses[Math.floor(Math.random() * responses.length)]
  }

  const handleSend = async (messageToSend?: string) => {
    const question = messageToSend || input.trim()
    if (!question) return

    // Clear any previous connection error
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
      const response = await getAIResponse(question)

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error('Chat error:', error)

      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'error',
        content: 'Sorry, I couldn\'t process your request. Please try again.',
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
    // Remove the error message before retrying
    setMessages((prev) => prev.filter((m) => m.role !== 'error' || m.retryPayload !== question))
    await handleSend(question)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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
        <div className="max-w-4xl mx-auto flex items-center gap-4">
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
      </div>

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
          {messages.map((message) => (
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
                <p className={
                  message.role === 'user'
                    ? 'text-white'
                    : message.role === 'error'
                      ? 'text-red-700'
                      : 'text-gray-700'
                }>
                  {message.content}
                </p>
                {message.role === 'error' && message.retryPayload && (
                  <button
                    onClick={() => handleRetry(message.retryPayload!)}
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
          ))}

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <Bot className="text-white" size={16} />
              </div>
              <div className="bg-white border border-gray-200 p-4 rounded-2xl">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
