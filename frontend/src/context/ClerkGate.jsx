// Clerk sign-in, loaded only when the server says Clerk is on (keeps Clerk out of the dev bundle path).
// Sign-up is not offered: a mentor adds people in Team, and Clerk should be set to Restricted mode.
import { useEffect, useState } from 'react'
import { ClerkProvider, SignIn, useAuth } from '@clerk/clerk-react'
import { setTokenSource } from '../lib/api'
import BrandMark from '../components/BrandMark'

function Inner({ children }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useAuth()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    setTokenSource(() => getToken())
    setReady(true)
  }, [isLoaded, isSignedIn, getToken])
  if (!isLoaded) return null
  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4">
        <div className="flex items-center gap-3"><BrandMark size={40} /><span className="text-xl font-semibold tracking-tight">302 Hub</span></div>
        <SignIn routing="hash" withSignUp={false} />
      </div>
    )
  }
  if (!ready) return null
  return children(() => signOut())
}

export default function ClerkGate({ publishableKey, children }) {
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <Inner>{children}</Inner>
    </ClerkProvider>
  )
}
