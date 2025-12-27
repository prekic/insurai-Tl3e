import { useState } from 'react'
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Edit2, Save, Camera, FileText, CreditCard } from 'lucide-react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Badge } from './ui/badge'

interface MyAccountProps {
  onBack: () => void
}

export function MyAccount({ onBack }: MyAccountProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [profile, setProfile] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+90 532 123 4567',
    location: 'Istanbul, Turkey',
    company: 'ABC Insurance Broker',
    memberSince: '2024-01-15',
  })

  const stats = {
    policiesAnalyzed: 24,
    comparisons: 12,
    savedReports: 8,
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-3xl font-bold text-gray-900">My Account</h1>
        </div>

        <div className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold">
                    JD
                  </div>
                  <button className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                    <Camera size={16} className="text-gray-600" />
                  </button>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-bold text-gray-900">{profile.name}</h2>
                  <p className="text-gray-600">{profile.company}</p>
                  <Badge variant="secondary" className="mt-2">Pro Plan</Badge>
                </div>
                <Button
                  variant={isEditing ? 'default' : 'outline'}
                  onClick={() => setIsEditing(!isEditing)}
                  className="gap-2"
                >
                  {isEditing ? <Save size={18} /> : <Edit2 size={18} />}
                  {isEditing ? 'Save' : 'Edit Profile'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profile Details */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <User size={14} className="inline mr-1" />
                    Full Name
                  </label>
                  {isEditing ? (
                    <Input
                      value={profile.name}
                      onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <Mail size={14} className="inline mr-1" />
                    Email
                  </label>
                  {isEditing ? (
                    <Input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.email}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <Phone size={14} className="inline mr-1" />
                    Phone
                  </label>
                  {isEditing ? (
                    <Input
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.phone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <MapPin size={14} className="inline mr-1" />
                    Location
                  </label>
                  {isEditing ? (
                    <Input
                      value={profile.location}
                      onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.location}</p>
                  )}
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar size={14} />
                  <span>Member since {new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Usage Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <FileText className="mx-auto mb-2 text-blue-600" size={24} />
                  <p className="text-2xl font-bold text-gray-900">{stats.policiesAnalyzed}</p>
                  <p className="text-sm text-gray-600">Policies Analyzed</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <CreditCard className="mx-auto mb-2 text-purple-600" size={24} />
                  <p className="text-2xl font-bold text-gray-900">{stats.comparisons}</p>
                  <p className="text-sm text-gray-600">Comparisons</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <FileText className="mx-auto mb-2 text-green-600" size={24} />
                  <p className="text-2xl font-bold text-gray-900">{stats.savedReports}</p>
                  <p className="text-sm text-gray-600">Saved Reports</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Pro Plan</h3>
                  <p className="text-gray-600">Unlimited policy analysis and comparisons</p>
                </div>
                <Button>Manage Subscription</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
