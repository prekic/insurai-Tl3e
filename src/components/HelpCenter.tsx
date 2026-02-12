import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Book, MessageSquare, FileText, HelpCircle, ChevronRight, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { useI18n } from '@/lib/i18n'

export function HelpCenter() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [searchQuery, setSearchQuery] = useState('')

  const categories = [
    {
      icon: FileText,
      title: t.help.gettingStarted,
      description: t.help.gettingStartedDesc,
      articles: 5,
    },
    {
      icon: Book,
      title: t.help.policyAnalysis,
      description: t.help.policyAnalysisDesc,
      articles: 8,
    },
    {
      icon: HelpCircle,
      title: t.help.faq,
      description: t.help.faqDesc,
      articles: 12,
    },
    {
      icon: MessageSquare,
      title: t.help.troubleshooting,
      description: t.help.troubleshootingDesc,
      articles: 6,
    },
  ]

  const popularArticles = [
    t.help.article1,
    t.help.article2,
    t.help.article3,
    t.help.article4,
    t.help.article5,
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t.help.title}</h1>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t.help.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-4 border border-gray-200 rounded-2xl text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Categories */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {categories.map((category, i) => {
            const Icon = category.icon
            return (
              <Card key={i} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Icon className="text-blue-600" size={24} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{category.title}</h3>
                      <p className="text-sm text-gray-600">{category.description}</p>
                      <p className="text-sm text-blue-600 mt-2">{t.help.articlesCount.replace('{count}', String(category.articles))}</p>
                    </div>
                    <ChevronRight className="text-gray-400" size={20} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Popular Articles */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>{t.help.popularArticles}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {popularArticles.map((article, i) => (
                <li key={i}>
                  <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors text-left">
                    <span className="text-gray-700">{article}</span>
                    <ExternalLink size={16} className="text-gray-400" />
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Contact Support */}
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <MessageSquare className="mx-auto mb-4 text-blue-600" size={40} />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{t.help.stillNeedHelp}</h3>
              <p className="text-gray-600 mb-4">{t.help.stillNeedHelpDesc}</p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate('/chat')} className="gap-2">
                  <MessageSquare size={18} />
                  {t.help.chatWithAI}
                </Button>
                <Button variant="outline">{t.help.contactSupport}</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
