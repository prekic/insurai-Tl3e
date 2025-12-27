import { useState } from 'react'
import { ArrowLeft, Moon, Sun, Bell, Shield, Globe, Key, LogOut, ChevronRight, Monitor } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface SettingsProps {
  onBack: () => void
  onNavigateToAdmin?: () => void
}

export function Settings({ onBack, onNavigateToAdmin }: SettingsProps) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light')
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    renewalReminders: true,
    marketUpdates: false,
  })
  const [language, setLanguage] = useState('tr')

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        </div>

        <div className="space-y-6">
          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="text-amber-500" size={20} />
                Appearance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {themeOptions.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value as typeof theme)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        theme === option.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Icon size={24} className={theme === option.value ? 'text-blue-600' : 'text-gray-600'} />
                      <span className={`text-sm font-medium ${theme === option.value ? 'text-blue-600' : 'text-gray-600'}`}>
                        {option.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="text-blue-500" size={20} />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <button
                    onClick={() => setNotifications((prev) => ({ ...prev, [key]: !value }))}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      value ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        value ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Language */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="text-green-500" size={20} />
                Language
              </CardTitle>
            </CardHeader>
            <CardContent>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tr">Turkish (Turkce)</option>
                <option value="en">English</option>
              </select>
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="text-purple-500" size={20} />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <Key size={20} className="text-gray-600" />
                  <span className="text-gray-700">Change Password</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
              <button className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <Shield size={20} className="text-gray-600" />
                  <span className="text-gray-700">Two-Factor Authentication</span>
                </div>
                <ChevronRight size={20} className="text-gray-400" />
              </button>
            </CardContent>
          </Card>

          {/* Admin Panel Link */}
          {onNavigateToAdmin && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <button
                  onClick={onNavigateToAdmin}
                  className="w-full flex items-center justify-between p-4 bg-white rounded-xl hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Shield className="text-purple-600" size={20} />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-900">Admin Panel</p>
                      <p className="text-sm text-gray-500">Manage users, API keys, and system settings</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" />
                </button>
              </CardContent>
            </Card>
          )}

          {/* Sign Out */}
          <Button variant="outline" className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onBack}>
            <LogOut size={18} />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  )
}
