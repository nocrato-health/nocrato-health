import { Component, ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <p className="text-lg font-medium text-red-600">Algo deu errado</p>
          <p className="text-sm text-amber-mid mt-1">
            Recarregue a página ou tente novamente.
          </p>
          <Button
            variant="link"
            className="mt-4"
            onClick={() => this.setState({ hasError: false })}
          >
            Tentar novamente
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
