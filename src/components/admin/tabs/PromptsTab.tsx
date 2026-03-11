/**
 * Prompts Tab
 * Manage AI prompt templates
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Plus,
  Edit2,
  Save,
  X,
  MessageSquare,
  FileText,
  Eye,
  Sparkles,
  Workflow,
  ArrowRight,
} from 'lucide-react'
import { getPromptTemplates, createPromptTemplate, updatePromptTemplate } from '@/lib/admin/api'
import type { PromptTemplate } from '@/lib/admin/types'

export function PromptsTab() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<PromptTemplate>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const PROMPT_EXECUTION_ORDER: Record<string, string> = {
    'Document Preprocessing': '1a',
    'OCR Correction - Lightweight': '1b',
    'Document Normalization - Full': '1c',
    'Policy Type Detection': '2',
    'Kasko Extraction': '3a',
    'Traffic Insurance Extraction': '3b',
    'Home Insurance Extraction': '3c',
    'Health Insurance Extraction': '3d',
    'Life Insurance Extraction': '3e',
    'DASK Extraction': '3f',
    'Business Insurance Extraction': '3g',
    'Nakliyat Insurance Extraction': '3h',
    'Policy Extraction - Master': '3i',
    'Extraction Quality Scoring': '4',
    'Coverage Gap Analysis': '5a',
    'AI Insights - Sense Check': '5b',
    'Policy Chat Assistant': '6',
  }

  const sortedTemplates = [...templates].sort((a, b) => {
    const orderA = PROMPT_EXECUTION_ORDER[a.name] || '99'
    const orderB = PROMPT_EXECUTION_ORDER[b.name] || '99'
    return orderA.localeCompare(orderB, undefined, { numeric: true, sensitivity: 'base' })
  })

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      setError(null)
      const response = await getPromptTemplates()
      if (response.success && response.data) {
        setTemplates(response.data as PromptTemplate[])
      } else {
        setError(response.error || 'Failed to fetch templates')
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch templates')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    try {
      setIsSaving(true)
      setError(null)
      const response = await updatePromptTemplate(id, editForm)
      if (response.success) {
        setTemplates(templates.map((t) => (t.id === id ? { ...t, ...editForm } : t)))
        setEditingId(null)
        setEditForm({})
        setSaveSuccess('Template saved successfully')
        setTimeout(() => setSaveSuccess(null), 3000)
      } else {
        setError(response.error || 'Failed to save template')
      }
    } catch (error) {
      console.error('Failed to save template:', error)
      setError(error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreate = async () => {
    try {
      setIsSaving(true)
      setError(null)
      const response = await createPromptTemplate({
        name: editForm.name || '',
        description: editForm.description || '',
        category: editForm.category || 'other',
        systemPrompt: editForm.systemPrompt || '',
        userPromptTemplate: editForm.userPromptTemplate || '',
        isDefault: false,
      })
      if (response.success && response.data) {
        setTemplates([...templates, response.data as PromptTemplate])
        setShowCreateForm(false)
        setEditForm({})
        setSaveSuccess('Template created successfully')
        setTimeout(() => setSaveSuccess(null), 3000)
      } else {
        setError(response.error || 'Failed to create template')
      }
    } catch (error) {
      console.error('Failed to create template:', error)
      setError(error instanceof Error ? error.message : 'Failed to create template')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      setError(null)
      const response = await updatePromptTemplate(id, { isActive: !isActive })
      if (response.success) {
        setTemplates(templates.map((t) => (t.id === id ? { ...t, isActive: !isActive } : t)))
        setSaveSuccess(`Template ${!isActive ? 'activated' : 'deactivated'} successfully`)
        setTimeout(() => setSaveSuccess(null), 3000)
      } else {
        setError(response.error || 'Failed to toggle template status')
      }
    } catch (error) {
      console.error('Failed to toggle template:', error)
      setError(error instanceof Error ? error.message : 'Failed to toggle template status')
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'extraction':
        return <FileText className="h-4 w-4" />
      case 'chat':
        return <MessageSquare className="h-4 w-4" />
      case 'ocr':
        return <Eye className="h-4 w-4" />
      default:
        return <Sparkles className="h-4 w-4" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'extraction':
        return 'bg-purple-100 text-purple-800'
      case 'chat':
        return 'bg-blue-100 text-blue-800'
      case 'ocr':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prompt Templates</h1>
          <p className="text-gray-500">Manage AI prompts for extraction, chat, and OCR</p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} disabled={isSaving}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Execution Flow Schema */}
      <Card className="bg-indigo-50/30 border-indigo-100 shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-bold text-indigo-900 flex items-center gap-2">
            <Workflow className="h-4 w-4" />
            Pipeline Execution Flow
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="text-sm text-gray-600 flex flex-wrap gap-2 items-center">
            <div className="flex flex-col gap-1.5 border border-indigo-100 bg-white p-2 rounded-lg shadow-sm">
              <span className="text-[10px] font-bold text-center text-indigo-400 uppercase tracking-wider">
                1. OCR & Preprocessing
              </span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  1a. Preprocessing
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  1b. Lightweight
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  1c. Full Normalization
                </Badge>
              </div>
            </div>{' '}
            <ArrowRight className="h-3 w-3 text-indigo-300" />
            <Badge variant="secondary" className="bg-white text-indigo-700 shadow-sm">
              2. Type Detection
            </Badge>{' '}
            <ArrowRight className="h-3 w-3 text-indigo-300" />
            <div className="flex flex-col gap-1.5 border border-indigo-100 bg-white p-2 rounded-lg shadow-sm">
              <span className="text-[10px] font-bold text-center text-indigo-400 uppercase tracking-wider">
                3. Extraction (Match By Type)
              </span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3a. Kasko
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3b. Traffic
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3c. Home
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3d. Health
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3e. Life
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3f. DASK
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3g. Business
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  3h. Nakliyat
                </Badge>
                <Badge variant="outline" className="text-xs border-indigo-200">
                  3i. Fallback
                </Badge>
              </div>
            </div>{' '}
            <ArrowRight className="h-3 w-3 text-indigo-300" />
            <Badge variant="secondary" className="bg-white text-indigo-700 shadow-sm">
              4. QA Scoring
            </Badge>{' '}
            <ArrowRight className="h-3 w-3 text-indigo-300" />
            <div className="flex flex-col gap-1.5 border border-indigo-100 bg-white p-2 rounded-lg shadow-sm">
              <span className="text-[10px] font-bold text-center text-indigo-400 uppercase tracking-wider">
                5. Analysis
              </span>
              <div className="flex flex-wrap gap-1.5 justify-center">
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  5a. Gap Analysis
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50/50">
                  5b. AI Insights
                </Badge>
              </div>
            </div>
            <span className="text-gray-300 ml-2 mr-2">|</span>
            <Badge
              variant="outline"
              className="bg-gray-50 text-gray-500 border-dashed border-gray-300 shadow-sm"
            >
              6. Chat Assistant (On-Demand)
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Success Message */}
      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {saveSuccess}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <Input
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Template name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg"
                  value={editForm.category || ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      category: e.target.value as PromptTemplate['category'],
                    })
                  }
                >
                  <option value="">Select category</option>
                  <option value="extraction">Extraction</option>
                  <option value="chat">Chat</option>
                  <option value="ocr">OCR</option>
                  <option value="analysis">Analysis</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <Input
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Brief description of this template"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                rows={4}
                value={editForm.systemPrompt || ''}
                onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                placeholder="System instructions for the AI..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                User Prompt Template
                <span className="text-gray-400 font-normal ml-2">
                  (Use {'{{variable}}'} for dynamic values)
                </span>
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                rows={4}
                value={editForm.userPromptTemplate || ''}
                onChange={(e) => setEditForm({ ...editForm, userPromptTemplate: e.target.value })}
                placeholder="User prompt with {{variables}}..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false)
                  setEditForm({})
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Creating...' : 'Create Template'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading templates...</div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No prompt templates found. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          sortedTemplates.map((template) => {
            const executionOrder = PROMPT_EXECUTION_ORDER[template.name]
            return (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center justify-center">
                        <div className={`p-2 rounded-lg ${getCategoryColor(template.category)}`}>
                          {getCategoryIcon(template.category)}
                        </div>
                        {executionOrder && (
                          <div className="mt-1 text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            #{executionOrder}
                          </div>
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">v{template.version}</Badge>
                      <Badge className={getCategoryColor(template.category)}>
                        {template.category}
                      </Badge>
                      {template.isActive ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {editingId === template.id ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          System Prompt
                        </label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                          rows={4}
                          value={editForm.systemPrompt ?? template.systemPrompt}
                          onChange={(e) =>
                            setEditForm({ ...editForm, systemPrompt: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          User Prompt Template
                        </label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                          rows={4}
                          value={editForm.userPromptTemplate ?? template.userPromptTemplate}
                          onChange={(e) =>
                            setEditForm({ ...editForm, userPromptTemplate: e.target.value })
                          }
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingId(null)
                            setEditForm({})
                          }}
                          disabled={isSaving}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button onClick={() => handleSave(template.id)} disabled={isSaving}>
                          <Save className="h-4 w-4 mr-2" />
                          {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">System Prompt</h4>
                        <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto max-h-32">
                          {template.systemPrompt}
                        </pre>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-1">
                          User Prompt Template
                        </h4>
                        <pre className="p-3 bg-blue-50 text-blue-900 rounded-lg text-sm overflow-x-auto max-h-32">
                          {template.userPromptTemplate}
                        </pre>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <div className="text-sm text-gray-500">
                          Used {template.usageCount} times
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleActive(template.id, template.isActive)}
                          >
                            {template.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingId(template.id)
                              setEditForm({
                                systemPrompt: template.systemPrompt,
                                userPromptTemplate: template.userPromptTemplate,
                              })
                            }}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}

export default PromptsTab
