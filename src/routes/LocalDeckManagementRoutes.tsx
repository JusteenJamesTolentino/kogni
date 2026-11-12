import { Navigate } from 'react-router-dom'
import { paths } from '../router/paths'

export function LocalDeckEditRoute() {
  return <Navigate to={paths.legacyDecks} replace />
}

export function LocalDeckRegenerateRoute() {
  return <Navigate to={paths.import} replace />
}
