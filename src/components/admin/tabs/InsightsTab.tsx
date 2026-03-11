import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, Edit2, Save, X, Lightbulb } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

type Guideline = Database['public']['Tables']['ai_insight_guidelines']['Row']

export function InsightsTab() {
  const [guidelines, setGuidelines] = useState<Guideline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Guideline>>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  const [showPreview, setShowPreview] = useState(false)
  const [previewPrompt, setPreviewPrompt] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  useEffect(() => {
    fetchGuidelines()
  }, [])

  const fetchPromptPreview = async () => {
    try {
      setIsLoadingPreview(true)
      setError(null)
      const res = await fetch('/api/ai/sense-check-prompt-preview')
      if (!res.ok) throw new Error('Failed to fetch prompt preview')
      const data = await res.json()
      if (data.success) {
        setPreviewPrompt(data.prompt)
        setShowPreview(true)
      } else {
        throw new Error(data.error || 'Failed to generate preview')
      }
    } catch (err) {
      console.error('Failed to load prompt preview:', err)
      setError(err instanceof Error ? err.message : 'Error loading prompt preview')
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const fetchGuidelines = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const { data, error: fetchError } = await supabase
        .from('ai_insight_guidelines')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      if (data) setGuidelines(data)
    } catch (err) {
      console.error('Failed to fetch guidelines:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch guidelines')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    try {
      setIsSaving(true)
      setError(null)
      const { data, error: updateError } = await supabase
        .from('ai_insight_guidelines')
        .update({
          policy_type: editForm.policy_type,
          region_code: editForm.region_code,
          guidance_text: editForm.guidance_text,
          is_active: editForm.is_active,
        })
        .eq('id', id)
        .select()
        .single()

      if (updateError) throw updateError

      if (data) {
        setGuidelines(guidelines.map((g) => (g.id === id ? data : g)))
        setEditingId(null)
        setEditForm({})
        setSaveSuccess('Guideline saved successfully')
        setTimeout(() => setSaveSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Failed to save guideline:', err)
      setError(err instanceof Error ? err.message : 'Failed to save guideline')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreate = async () => {
    try {
      setIsSaving(true)
      setError(null)
      const { data, error: insertError } = await supabase
        .from('ai_insight_guidelines')
        .insert({
          policy_type: editForm.policy_type || '*',
          region_code: editForm.region_code || '*',
          guidance_text: editForm.guidance_text || '',
          is_active: editForm.is_active ?? true,
        })
        .select()
        .single()

      if (insertError) throw insertError

      if (data) {
        setGuidelines([data, ...guidelines])
        setShowCreateForm(false)
        setEditForm({})
        setSaveSuccess('Guideline created successfully')
        setTimeout(() => setSaveSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Failed to create guideline:', err)
      setError(err instanceof Error ? err.message : 'Failed to create guideline')
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      setError(null)
      const { data, error: toggleError } = await supabase
        .from('ai_insight_guidelines')
        .update({ is_active: !currentStatus })
        .eq('id', id)
        .select()
        .single()

      if (toggleError) throw toggleError

      if (data) {
        setGuidelines(guidelines.map((g) => (g.id === id ? data : g)))
        setSaveSuccess(`Guideline ${!currentStatus ? 'activated' : 'deactivated'} successfully`)
        setTimeout(() => setSaveSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Failed to toggle guideline:', err)
      setError(err instanceof Error ? err.message : 'Failed to toggle guideline status')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Insight Guidelines</h1>
          <p className="text-gray-500">Manage rules to guide the AI's sense-checker for insights</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchPromptPreview}
            disabled={isLoadingPreview || isSaving}
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            {isLoadingPreview ? 'Loading...' : 'Preview Prompt'}
          </Button>
          <Button onClick={() => setShowCreateForm(true)} disabled={isSaving}>
            <Plus className="h-4 w-4 mr-2" />
            New Guideline
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {saveSuccess}
        </div>
      )}

      {showPreview && previewPrompt && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3 border-b border-blue-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-blue-900 flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-blue-600" />
                Final System Prompt Preview
              </CardTitle>
              <CardDescription className="text-blue-700 mt-1">
                This is the exact prompt the AI receives, including your active custom guidelines.
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowPreview(false)}
              className="text-blue-500 hover:text-blue-700"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
              {previewPrompt}
            </pre>
          </CardContent>
        </Card>
      )}

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Guideline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Policy Type</label>
                <Input
                  value={editForm.policy_type || ''}
                  onChange={(e) => setEditForm({ ...editForm, policy_type: e.target.value })}
                  placeholder="e.g. kasko, *, home"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Region Code</label>
                <Input
                  value={editForm.region_code || ''}
                  onChange={(e) => setEditForm({ ...editForm, region_code: e.target.value })}
                  placeholder="e.g. TR, *"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guidance Text</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                rows={4}
                value={editForm.guidance_text || ''}
                onChange={(e) => setEditForm({ ...editForm, guidance_text: e.target.value })}
                placeholder="Instruct the AI on what to filter..."
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
                {isSaving ? 'Creating...' : 'Create Guideline'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading guidelines...</div>
        ) : guidelines.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No guidelines found. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          guidelines.map((guideline) => (
            <Card key={guideline.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {guideline.policy_type === '*' ? 'Global Policy' : guideline.policy_type}
                        {' - '}
                        {guideline.region_code === '*' ? 'Global Region' : guideline.region_code}
                      </CardTitle>
                      <CardDescription>
                        Created:{' '}
                        {guideline.created_at
                          ? new Date(guideline.created_at).toLocaleDateString()
                          : 'Unknown'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {guideline.is_active ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {editingId === guideline.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Policy Type
                        </label>
                        <Input
                          value={editForm.policy_type ?? guideline.policy_type}
                          onChange={(e) =>
                            setEditForm({ ...editForm, policy_type: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Region Code
                        </label>
                        <Input
                          value={editForm.region_code ?? guideline.region_code}
                          onChange={(e) =>
                            setEditForm({ ...editForm, region_code: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Guidance Text
                      </label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm"
                        rows={4}
                        value={editForm.guidance_text ?? guideline.guidance_text}
                        onChange={(e) =>
                          setEditForm({ ...editForm, guidance_text: e.target.value })
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
                      <Button onClick={() => handleSave(guideline.id)} disabled={isSaving}>
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Guidance Text</h4>
                      <pre className="p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto max-h-32 whitespace-pre-wrap">
                        {guideline.guidance_text}
                      </pre>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="text-sm text-gray-500"></div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleActive(guideline.id, guideline.is_active ?? true)}
                        >
                          {guideline.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(guideline.id)
                            setEditForm({
                              policy_type: guideline.policy_type,
                              region_code: guideline.region_code,
                              guidance_text: guideline.guidance_text,
                              is_active: guideline.is_active,
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

export default InsightsTab
