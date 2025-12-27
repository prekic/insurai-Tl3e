import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, ArrowLeft } from 'lucide-react'
import { Button } from './ui/button'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface DashboardPolicy {
  id: string
  policyNumber: string
  provider: string
  type: string
  coverage: number
  premium: number
}

interface PolicyChatProps {
  uploadedPolicies: DashboardPolicy[]
  onBack: () => void
}

export function PolicyChat({ uploadedPolicies, onBack }: PolicyChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I'm your AI insurance assistant. I can help you understand your ${uploadedPolicies.length} uploaded policies. Ask me anything about your coverage, compare policies, or get recommendations.`,
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const responses = [
      'Based on your uploaded policies, your Kasko coverage from Allianz provides comprehensive protection including collision, theft, and natural disaster coverage.',
      'Looking at your portfolio, I notice your health insurance policy from Mapfre is expiring soon. Would you like me to help you compare renewal options?',
      'Your current policies provide a total coverage of over 2 million TL across different insurance lines. The average premium you\'re paying is competitive with market rates.',
      'I can see you have both mandatory traffic insurance and comprehensive Kasko. This is a good combination for complete vehicle protection.',
    ]

    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: responses[Math.floor(Math.random() * responses.length)],
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, aiMessage])
    setIsTyping(false)
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
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <Bot className="text-white" size={20} />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">Policy Assistant</h1>
              <p className="text-xs text-gray-500">{uploadedPolicies.length} policies loaded</p>
            </div>
          </div>
        </div>
      </div>

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
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200'
                }`}
              >
                <p className={message.role === 'user' ? 'text-white' : 'text-gray-700'}>
                  {message.content}
                </p>
                <p
                  className={`text-xs mt-2 ${
                    message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
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
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors"
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
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask about your policies..."
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Button onClick={handleSend} className="gap-2">
              <Send size={18} />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
