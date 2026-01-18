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
} from 'lucide-react'

interface PromptTemplate {
  id: string
  name: string
  description: string
  category: string
  systemPrompt: string
  userPromptTemplate: string
  isActive: boolean
  usageCount: number
  version: number
}

export function PromptsTab() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<PromptTemplate>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/admin/prompts')
      const data = await response.json()
      if (data.success) {
        setTemplates(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await response.json()
      if (data.success) {
        setTemplates(templates.map((t) => (t.id === id ? { ...t, ...editForm } : t)))
        setEditingId(null)
        setEditForm({})
      }
    } catch (error) {
      console.error('Failed to save template:', error)
    }
  }

  const handleCreate = async () => {
    try {
      const response = await fetch('/api/admin/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      const data = await response.json()
      if (data.success) {
        setTemplates([...templates, data.data])
        setShowCreateForm(false)
        setEditForm({})
      }
    } catch (error) {
      console.error('Failed to create template:', error)
    }
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/prompts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      const data = await response.json()
      if (data.success) {
        setTemplates(templates.map((t) => (t.id === id ? { ...t, isActive: !isActive } : t)))
      }
    } catch (error) {
      console.error('Failed to toggle template:', error)
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
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

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
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
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
              <Button variant="outline" onClick={() => {
                setShowCreateForm(false)
                setEditForm({})
              }}>
                Cancel
              </Button>
              <Button onClick={handleCreate}>
                <Save className="h-4 w-4 mr-2" />
                Create Template
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
          templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${getCategoryColor(template.category)}`}>
                      {getCategoryIcon(template.category)}
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
                        value={editForm.systemPrompt || template.systemPrompt}
                        onChange={(e) => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        User Prompt Template
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                        rows={4}
                        value={editForm.userPromptTemplate || template.userPromptTemplate}
                        onChange={(e) => setEditForm({ ...editForm, userPromptTemplate: e.target.value })}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => {
                        setEditingId(null)
                        setEditForm({})
                      }}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button onClick={() => handleSave(template.id)}>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
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
                      <h4 className="text-sm font-medium text-gray-700 mb-1">User Prompt Template</h4>
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
          ))
        )}
      </div>
    </div>
  )
}

export default PromptsTab
