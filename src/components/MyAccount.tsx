import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
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
import { useI18n } from '@/lib/i18n'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  isSupabaseConfigured,
  fetchUserProfile,
  updateUserProfile,
  fetchUserStats,
  type UserStats,
} from '@/lib/supabase'
import { UserPreferencesPanel } from './UserPreferencesPanel'

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
  const { t, locale } = useI18n()
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
          toast.error(t.account.failedToLoad)
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
  }, [useSupabase, user, t])

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
        toast.success(t.account.profileUpdated, {
          description: t.account.profileUpdatedDesc,
        })
      } else {
        // Save to localStorage
        localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile))
        toast.success(t.account.profileSavedLocally, {
          description: t.account.profileSavedLocallyDesc,
        })
      }

      setOriginalProfile(null)
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save profile:', error)
      toast.error(t.account.failedToSave, {
        description: error instanceof Error ? error.message : t.account.tryAgain,
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
          <h1 className="text-3xl font-bold text-gray-900">{t.account.title}</h1>
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
                    aria-label={t.account.changePhoto}
                  >
                    <Camera size={16} className="text-gray-600" />
                  </button>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-2xl font-bold text-gray-900">
                    {profile.name || t.account.yourName}
                  </h2>
                  <p className="text-gray-600">{profile.company || t.account.addCompany}</p>
                  <Badge variant="secondary" className="mt-2">
                    {useSupabase ? t.account.cloudSynced : t.account.localOnly}
                  </Badge>
                </div>
                {isEditing ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                      <X size={18} className="mr-1" />
                      {t.common.cancel}
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 size={18} className="mr-1 animate-spin" />
                      ) : (
                        <Save size={18} className="mr-1" />
                      )}
                      {isSaving ? t.account.saving : t.common.save}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={handleEdit} className="gap-2">
                    <Edit2 size={18} />
                    {t.account.editProfile}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Profile Details */}
          <Card>
            <CardHeader>
              <CardTitle>{t.account.personalInfo}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <User size={14} className="inline mr-1" />
                    {t.account.fullName}
                  </label>
                  {isEditing ? (
                    <Input
                      value={profile.name}
                      onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                      placeholder={t.account.namePlaceholder}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.name || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <Mail size={14} className="inline mr-1" />
                    {t.account.email}
                  </label>
                  {isEditing ? (
                    <Input
                      type="email"
                      value={profile.email}
                      disabled={useSupabase} // Can't change email when using Supabase
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                      placeholder={t.account.emailPlaceholder}
                      className={useSupabase ? 'bg-gray-100' : ''}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.email || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <Phone size={14} className="inline mr-1" />
                    {t.account.phone}
                  </label>
                  {isEditing ? (
                    <Input
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                      placeholder={t.account.phonePlaceholder}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.phone || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    <MapPin size={14} className="inline mr-1" />
                    {t.account.location}
                  </label>
                  {isEditing ? (
                    <Input
                      value={profile.location}
                      onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
                      placeholder={t.account.locationPlaceholder}
                    />
                  ) : (
                    <p className="font-medium text-gray-900">{profile.location || '—'}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-500 mb-1">
                    <Building size={14} className="inline mr-1" />
                    {t.account.company}
                  </label>
                  {isEditing ? (
                    <Input
                      value={profile.company}
                      onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))}
                      placeholder={t.account.companyPlaceholder}
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
                      {t.account.memberSince}{' '}
                      {new Date(memberSince).toLocaleDateString(
                        locale === 'tr' ? 'tr-TR' : 'en-US',
                        {
                          month: 'long',
                          year: 'numeric',
                        }
                      )}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* User Preferences (FX, Theme, Display Settings) */}
          <UserPreferencesPanel />

          {/* Usage Stats */}
          <Card>
            <CardHeader>
              <CardTitle>{t.account.usageStatistics}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <FileText className="mx-auto mb-2 text-blue-600" size={24} />
                  <p className="text-2xl font-bold text-gray-900">{stats.policiesAnalyzed}</p>
                  <p className="text-sm text-gray-600">{t.account.policiesAnalyzed}</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <CreditCard className="mx-auto mb-2 text-purple-600" size={24} />
                  <p className="text-2xl font-bold text-gray-900">{stats.comparisons}</p>
                  <p className="text-sm text-gray-600">{t.account.comparisons}</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <FileText className="mx-auto mb-2 text-green-600" size={24} />
                  <p className="text-2xl font-bold text-gray-900">{stats.savedReports}</p>
                  <p className="text-sm text-gray-600">{t.account.savedReports}</p>
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
                    {useSupabase ? t.account.cloudStorage : t.account.localStorage}
                  </h3>
                  <p className="text-gray-600">
                    {useSupabase ? t.account.dataSynced : t.account.signInToSync}
                  </p>
                </div>
                {!useSupabase && (
                  <Button onClick={() => navigate('/auth/sign-in')}>{t.account.signIn}</Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
