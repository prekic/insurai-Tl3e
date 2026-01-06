import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Edit2,
  Save,
  Camera,
  FileText,
  CreditCard,
  Building,
  Loader2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  isSupabaseConfigured,
  fetchUserProfile,
  updateUserProfile,
  fetchUserStats,
  type UserStats,
} from '@/lib/supabase'

// Local storage key for profile when not using Supabase
const LOCAL_PROFILE_KEY = 'insurai_user_profile'

interface LocalProfile {
  name: string
  email: string
  phone: string
  location: string
  company: string
}

export function MyAccount() {
  const navigate = useNavigate()
  const { user, isConfigured: authConfigured } = useAuth()

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Profile state
  const [profile, setProfile] = useState<LocalProfile>({
    name: '',
    email: '',
    phone: '',
    location: '',
    company: '',
  })

  // Original profile for cancel functionality
  const [originalProfile, setOriginalProfile] = useState<LocalProfile | null>(null)

  // Member since date
  const [memberSince, setMemberSince] = useState<string | null>(null)

  // User stats
  const [stats, setStats] = useState<UserStats>({
    policiesAnalyzed: 0,
    comparisons: 0,
    savedReports: 0,
  })

  const useSupabase = authConfigured && isSupabaseConfigured() && !!user

  // Load profile data
  useEffect(() => {
    async function loadProfile() {
      setIsLoading(true)

      if (useSupabase && user) {
        try {
          // Fetch profile from Supabase
          const userProfile = await fetchUserProfile(user.id)
          const userStats = await fetchUserStats(user.id)

          if (userProfile) {
            setProfile({
              name: userProfile.fullName || '',
              email: userProfile.email || user.email || '',
              phone: userProfile.phone || '',
              location: userProfile.location || '',
              company: userProfile.company || '',
            })
            setMemberSince(userProfile.createdAt)
          } else {
            // User not in users table yet, use auth data
            setProfile({
              name: user.user_metadata?.full_name || '',
              email: user.email || '',
              phone: user.user_metadata?.phone || '',
              location: user.user_metadata?.location || '',
              company: user.user_metadata?.company || '',
            })
            setMemberSince(user.created_at)
          }

          setStats(userStats)
        } catch (error) {
          console.error('Failed to load profile:', error)
          toast.error('Failed to load profile')
        }
      } else {
        // Load from localStorage for guest users
        const savedProfile = localStorage.getItem(LOCAL_PROFILE_KEY)
        if (savedProfile) {
          try {
            const parsed = JSON.parse(savedProfile)
            setProfile(parsed)
          } catch {
            // Ignore parse errors
          }
        }
      }

      setIsLoading(false)
    }

    loadProfile()
  }, [useSupabase, user])

  const handleEdit = () => {
    setOriginalProfile({ ...profile })
    setIsEditing(true)
  }

  const handleCancel = () => {
    if (originalProfile) {
      setProfile(originalProfile)
    }
    setOriginalProfile(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    setIsSaving(true)

    try {
      if (useSupabase && user) {
        // Save to Supabase
        await updateUserProfile(user.id, {
          fullName: profile.name || undefined,
          phone: profile.phone || undefined,
          location: profile.location || undefined,
          company: profile.company || undefined,
        })
        toast.success('Profile updated', {
          description: 'Your changes have been saved to the cloud.',
        })
      } else {
        // Save to localStorage
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile))
        toast.success('Profile saved locally', {
          description: 'Sign in to sync across devices.',
        })
      }

      setOriginalProfile(null)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save profile:', error)
      toast.error('Failed to save profile', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Get initials for avatar
  const getInitials = () => {
    if (profile.name) {
      const parts = profile.name.split(' ')
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      }
      return profile.name.substring(0, 2).toUpperCase()
    }
    if (profile.email) {
      return profile.email.substring(0, 2).toUpperCase()
    }
    return 'U'
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white rounded-lg transition-colors"
            aria-label="Go back"
          >
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
                    {getInitials()}
                  </div>
                  <button
                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-white border border-gray-200 rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
                    aria-label="Change photo"
                  >
                    <Camera size={16} className="text-gray-600" />
                  </button>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {profile.name || 'Your Name'}
                  </h2>
                  <p className="text-gray-600">{profile.company || 'Add your company'}</p>
                  <Badge variant="secondary" className="mt-2">
                    {useSupabase ? 'Cloud Synced' : 'Local Only'}
                  </Badge>
                </div>
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                      <X size={18} className="mr-1" />
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 size={18} className="mr-1 animate-spin" />
                      ) : (
                        <Save size={18} className="mr-1" />
                      )}
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={handleEdit} className="gap-2">
                    <Edit2 size={18} />
                    Edit Profile
                  </Button>
                )}
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
                      placeholder="Enter your name"
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.name || '—'}</p>
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
                      disabled={useSupabase} // Can't change email when using Supabase
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                      placeholder="your@email.com"
                      className={useSupabase ? 'bg-gray-100' : ''}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.email || '—'}</p>
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
                      placeholder="+90 5XX XXX XXXX"
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.phone || '—'}</p>
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
                      placeholder="Istanbul, Turkey"
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.location || '—'}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-500 mb-1">
                    <Building size={14} className="inline mr-1" />
                    Company
                  </label>
                  {isEditing ? (
                    <Input
                      value={profile.company}
                      onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))}
                      placeholder="Your company name"
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.company || '—'}</p>
                  )}
                </div>
              </div>
              {memberSince && (
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar size={14} />
                    <span>
                      Member since{' '}
                      {new Date(memberSince).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>
              )}
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

          {/* Storage Info */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {useSupabase ? 'Cloud Storage' : 'Local Storage'}
                  </h3>
                  <p className="text-gray-600">
                    {useSupabase
                      ? 'Your data is synced across all devices'
                      : 'Sign in to sync your data across devices'}
                  </p>
                </div>
                {!useSupabase && (
                  <Button onClick={() => navigate('/auth/sign-in')}>Sign In</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
