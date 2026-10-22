// Clerk sign-in, loaded only when the server says Clerk is on. Sign-up is not offered: a mentor
// adds people under People, and the Clerk instance should be in Restricted mode. Clerk's own card
// chrome is stripped so the form sits in this page's layout (same approach as ProjectPro).
import { useEffect, useState } from 'react'
import { ClerkProvider, SignIn, useAuth } from '@clerk/clerk-react'
import { setTokenSource } from '../lib/api'
import SignInLayout from '../components/brand/SignInLayout'

const CLERK_COLORS = {
  light: { colorPrimary: '#0b0b0b', colorText: '#0b0b0b', colorTextSecondary: '#605f5b', colorBackground: '#fdfdfc', colorInputBackground: '#fdfdfc', colorInputText: '#0b0b0b', colorNeutral: '#0b0b0b', colorDanger: '#dc2626' },
  dark: { colorPrimary: '#f5f5f5', colorText: '#f5f5f5', colorTextSecondary: '#8f8f8f', colorBackground: '#0b0b0b', colorInputBackground: '#111111', colorInputText: '#f5f5f5', colorNeutral: '#f5f5f5', colorDanger: '#f87171' },
}
const appearance = () => ({
  variables: { ...CLERK_COLORS[document.documentElement.classList.contains('dark') ? 'dark' : 'light'], borderRadius: '0.625rem', fontFamily: 'inherit' },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none border-0 [&.cl-signIn-start_.cl-header]:hidden',
    card: 'w-full bg-transparent shadow-none border-0 p-0',
    footer: 'bg-transparent shadow-none',
    footerAction__signIn: 'hidden',
  },
})

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
      <SignInLayout heading="Sign in to Team 302" subheading="Use the email a mentor added you with.">
        <SignIn routing="hash" withSignUp={false} appearance={appearance()} />
      </SignInLayout>
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
