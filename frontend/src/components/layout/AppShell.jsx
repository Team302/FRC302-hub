// App frame, from ProjectPro's AppShell: sidebar, topbar, and a scrolling <main> whose content
// fades up on navigation.
import { useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import Shortcuts from '../Shortcuts'
import { useEnterAnimation } from '../ui/Motion'

// Board pages keep one animation key across ?item= changes, so opening a task doesn't replay it.
const transitionKey = (pathname) => pathname

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const contentRef = useRef(null)
  const mainRef = useRef(null)
  useEnterAnimation(contentRef, transitionKey(pathname))
  // Boards are wide tables: they get the full width instead of the reading column.
  const wide = pathname.startsWith('/boards/')

  return (
    <div className="relative flex h-screen overflow-hidden">
      <a href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus() }} data-app-chrome
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-black focus:shadow-pop focus:outline focus:outline-2 focus:outline-accent-500">
        Skip to main content
      </a>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 lg:hidden animate-fade-in" aria-hidden="true" onClick={() => setMobileOpen(false)} />
      )}
      <Shortcuts />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((p) => !p)} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div ref={contentRef} className={`mx-auto w-full ${wide ? 'max-w-none' : 'max-w-[1400px]'}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
