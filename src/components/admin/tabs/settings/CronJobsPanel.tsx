import { useState, useEffect } from 'react'
import { adminFetch } from '@/lib/admin/api'
import { Button } from '@/components/ui/button'
import { RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle, Calendar } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

interface CronJobRecord {
  jobid: number
  schedule: string
  command: string
  nodename: string
  nodeport: number
  database: string
  username: string
  active: boolean
  jobname: string
  recent_runs?: CronJobRun[]
}

interface CronJobRun {
  jobid: number
  runid: number
  job_pid: number
  database: string
  username: string
  command: string
  status: string
  return_message: string
  start_time: string
  end_time: string
}

export function CronJobsPanel() {
  const [jobs, setJobs] = useState<CronJobRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())

  const fetchJobs = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await adminFetch('/api/admin/monitoring/cron-jobs')

      if (!response.ok) {
        throw new Error(`Failed to fetch cron jobs. Status: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        setJobs(data.data)
        setLastRefreshed(new Date())
      } else {
        setError(data.error || 'Failed to fetch cron jobs')
      }
    } catch (err) {
      console.error('Error fetching cron jobs:', err)
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJobs()
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'succeeded':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
            Success
          </span>
        )
      case 'failed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            Failed
          </span>
        )
      case 'running':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            Running
          </span>
        )
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-gray-200 text-gray-800">
            {status}
          </span>
        )
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'succeeded':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />
    }
  }

  const formatDuration = (start: string, end: string) => {
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const durationMs = endTime - startTime

    if (durationMs < 1000) return `${durationMs}ms`
    return `${(durationMs / 1000).toFixed(2)}s`
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 border-b border-gray-100 gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Background Jobs Monitor</h2>
          <p className="text-sm text-gray-500 mt-1">
            Monitor scheduled database cleanup and maintenance tasks (pg_cron).
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Last updated: {format(lastRefreshed, 'HH:mm:ss')}
          </span>
          <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      <div className="p-6">
        {error ? (
          <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Failed to load background jobs</p>
              <p className="text-sm mt-1 text-red-600">{error}</p>
            </div>
          </div>
        ) : loading && jobs.length === 0 ? (
          <div className="flex justify-center items-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
            <Clock className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No Jobs Configured</h3>
            <p className="text-gray-500 mt-1 max-w-sm">
              There are no pg_cron jobs currently scheduled in the database.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {jobs.map((job) => (
              <div
                key={job.jobid}
                className="bg-white border text-card-foreground shadow-sm rounded-xl overflow-hidden"
              >
                <div className="bg-gray-50/80 px-5 py-4 border-b flex justify-between items-center sm:flex-row flex-col gap-3">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <h3 className="font-semibold text-gray-900 text-base">
                      {job.jobname || `Job #${job.jobid}`}
                    </h3>
                    {job.active ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        Active
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-white px-3 py-1.5 rounded-md border shadow-sm w-full sm:w-auto justify-center sm:justify-start">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <code className="mx-1 font-mono font-medium">{job.schedule}</code>
                  </div>
                </div>

                <div className="p-5">
                  <div className="mb-6">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Command
                    </h4>
                    <div className="bg-[#1e1e2f] text-gray-300 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                      {job.command}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Recent Runs
                    </h4>
                    {job.recent_runs && job.recent_runs.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 rounded-tl-md">Status</th>
                              <th className="px-4 py-2">Started</th>
                              <th className="px-4 py-2">Duration</th>
                              <th className="px-4 py-2 rounded-tr-md">Message</th>
                            </tr>
                          </thead>
                          <tbody>
                            {job.recent_runs.map((run) => (
                              <tr
                                key={run.runid}
                                className="border-b last:border-0 hover:bg-gray-50/50"
                              >
                                <td className="px-4 py-2 font-medium flex items-center gap-2">
                                  {getStatusIcon(run.status)}
                                  {getStatusBadge(run.status)}
                                </td>
                                <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                                  {format(new Date(run.start_time), 'MMM d, HH:mm:ss')}
                                  <span className="text-xs text-gray-400 ml-2 block sm:inline">
                                    (
                                    {formatDistanceToNow(new Date(run.start_time), {
                                      addSuffix: true,
                                    })}
                                    )
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-gray-600 font-mono">
                                  {run.end_time
                                    ? formatDuration(run.start_time, run.end_time)
                                    : '-'}
                                </td>
                                <td
                                  className="px-4 py-2 text-gray-600 max-w-xs truncate"
                                  title={run.return_message}
                                >
                                  {run.return_message || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                        <p className="text-sm text-gray-500 italic">
                          No recent runs found for this job.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
