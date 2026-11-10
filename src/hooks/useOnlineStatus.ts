import { useEffect, useState } from 'react'

export interface OnlineStatus {
  /** Whether this browser can currently reach a network, based on navigator.onLine. */
  isDeviceOnline: boolean
  /** Human-readable device connectivity copy. This is not the user's public presence. */
  deviceStatusLabel: 'Device online' | 'Device offline'
}

function readDeviceConnectivity(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

/**
 * Reports this device's browser connectivity only. It does not publish or infer
 * whether the learner is publicly online.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isDeviceOnline, setIsDeviceOnline] = useState(readDeviceConnectivity)

  useEffect(() => {
    const updateConnectivity = (): void => setIsDeviceOnline(readDeviceConnectivity())
    window.addEventListener('online', updateConnectivity)
    window.addEventListener('offline', updateConnectivity)
    return () => {
      window.removeEventListener('online', updateConnectivity)
      window.removeEventListener('offline', updateConnectivity)
    }
  }, [])

  return {
    isDeviceOnline,
    deviceStatusLabel: isDeviceOnline ? 'Device online' : 'Device offline',
  }
}

export default useOnlineStatus
