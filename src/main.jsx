import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initSentry, Sentry } from '@/lib/sentry'
import { reportClientOperationalEvent } from '@/lib/operationalEvents'

initSentry()

class PortalErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    try {
      Sentry.captureException?.(error, { extra: { componentStack: info?.componentStack } })
    } catch { /* no-op */ }
    reportClientOperationalEvent({
      severity: 'high',
      code: 'CLIENT_CRASH',
      message: String(error?.message || error || 'React render error').slice(0, 500),
      fingerprint: `CLIENT_CRASH:${String(error?.name || 'Error')}:${String(error?.message || '').slice(0, 80)}`,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0E1319] text-gray-200 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-3">
            <p className="text-lg font-semibold text-white">Something went wrong</p>
            <p className="text-sm text-gray-400">
              We logged the error. Refresh the page to continue. If it keeps happening, use Help &amp; Feedback or contact Cliqbux.
            </p>
            <button
              type="button"
              className="mt-2 px-4 py-2 rounded-lg bg-[#FEAC27] text-[#0E1319] font-medium"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <PortalErrorBoundary>
    <App />
  </PortalErrorBoundary>
)
