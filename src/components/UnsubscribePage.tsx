import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Mail, CheckCircle2, XCircle, AlertTriangle, ArrowLeft } from 'lucide-react'
import { Button } from './ui/button'
import { getEnvConfig } from '@/lib/env'

type UnsubscribeState = 'loading' | 'confirm' | 'processing' | 'success' | 'error' | 'invalid'

interface UnsubscribeError {
  message: string
  details?: string
}

export function UnsubscribePage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<UnsubscribeState>('loading')
  const [error, setError] = useState<UnsubscribeError | null>(null)

  const email = searchParams.get('email')
  const token = searchParams.get('token')

  // Validate params on mount
  useEffect(() => {
    if (!email || !token) {
      setState('invalid')
      setError({
        message: 'Gecersiz abonelikten cikma baglantisi',
        details: 'E-postanizdaki baglantidan tekrar deneyin.',
      })
    } else {
      setState('confirm')
    }
  }, [email, token])

  const handleUnsubscribe = async () => {
    if (!email || !token) return

    setState('processing')
    setError(null)

    try {
      const response = await fetch(`${getEnvConfig().apiProxyUrl}/api/email/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, token }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setState('success')
      } else {
        setState('error')
        setError({
          message: data.error || 'Abonelikten cikma basarisiz',
          details: data.message || 'Lutfen daha sonra tekrar deneyin.',
        })
      }
    } catch {
      setState('error')
      setError({
        message: 'Baglanti hatasi',
        details: 'Sunucuya ulasilamiyor. Lutfen internet baglantinizi kontrol edin.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
                state === 'success'
                  ? 'bg-green-100'
                  : state === 'error' || state === 'invalid'
                    ? 'bg-red-100'
                    : 'bg-blue-100'
              }`}
            >
              {state === 'success' ? (
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              ) : state === 'error' || state === 'invalid' ? (
                <XCircle className="w-8 h-8 text-red-600" />
              ) : (
                <Mail className="w-8 h-8 text-blue-600" />
              )}
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {state === 'success'
                ? 'Abonelikten Cikildi'
                : state === 'error' || state === 'invalid'
                  ? 'Hata Olustu'
                  : 'Abonelikten Cik'}
            </h1>

            {email && state !== 'invalid' && (
              <p className="text-gray-500 text-sm break-all">{email}</p>
            )}
          </div>

          {/* Content based on state */}
          {state === 'loading' && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          )}

          {state === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-800 text-sm font-medium">Emin misiniz?</p>
                    <p className="text-amber-700 text-sm mt-1">
                      Abonelikten cikarken artik asagidaki e-postalari almayacaksiniz:
                    </p>
                    <ul className="text-amber-700 text-sm mt-2 space-y-1 list-disc list-inside">
                      <li>Pazarlama ve tanitim e-postalari</li>
                      <li>Ozel teklifler ve kampanyalar</li>
                      <li>Urun guncellemeleri</li>
                    </ul>
                  </div>
                </div>
              </div>

              <p className="text-gray-600 text-sm text-center">
                Police uyarilari ve guvenlik bildirimleri gibi onemli e-postalari almaya devam
                edeceksiniz.
              </p>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleUnsubscribe}
                  variant="destructive"
                  className="w-full"
                  size="lg"
                >
                  Evet, Aboneligimi Iptal Et
                </Button>
                <Link to="/" className="block">
                  <Button variant="outline" className="w-full" size="lg">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Ana Sayfaya Don
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {state === 'processing' && (
            <div className="flex flex-col items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
              <p className="text-gray-600">Isleniyor...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-green-800 text-sm text-center">
                  Pazarlama e-postalarindan basariyla ciktiniz. Artik tanitim e-postalari
                  almayacaksiniz.
                </p>
              </div>

              <p className="text-gray-600 text-sm text-center">
                Fikrinizi degistirirseniz, hesap ayarlarinizdan tekrar abone olabilirsiniz.
              </p>

              <Link to="/" className="block">
                <Button variant="default" className="w-full" size="lg">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Ana Sayfaya Don
                </Button>
              </Link>
            </div>
          )}

          {(state === 'error' || state === 'invalid') && error && (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm font-medium">{error.message}</p>
                {error.details && <p className="text-red-700 text-sm mt-1">{error.details}</p>}
              </div>

              <div className="flex flex-col gap-3">
                {state === 'error' && (
                  <Button onClick={handleUnsubscribe} variant="default" className="w-full" size="lg">
                    Tekrar Dene
                  </Button>
                )}
                <Link to="/" className="block">
                  <Button variant="outline" className="w-full" size="lg">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Ana Sayfaya Don
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-xs mt-6">
          InsurAI - Turkiye&#39;nin #1 Sigorta Analiz Platformu
        </p>
      </div>
    </div>
  )
}
