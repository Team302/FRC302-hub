// Sign-in and account-state pages: ProjectPro's split layout with the team's brand panel.
import AuthSplitLayout from './AuthSplitLayout'
import BrandMark, { TeamLogo } from './BrandMark'

function BrandAside() {
  return (
    <>
      <div className="flex items-center gap-2.5">
        <BrandMark size="sm" tone="dark" />
        <span className="text-sm font-semibold tracking-tight">Team 302</span>
      </div>
      <div>
        <TeamLogo height={170} tone="dark" className="mb-10" />
        <p className="max-w-md text-[2rem] leading-[2.5rem] font-semibold tracking-[-0.025em]">Boards, meetings and<br />shared logins for Team 302.</p>
        <p className="mt-3 max-w-sm text-sm text-white/60">Lake Orion Robotics, The Dragons.</p>
      </div>
      <p className="text-xs text-white/40">FIRST Robotics Competition Team 302</p>
    </>
  )
}

export default function SignInLayout({ heading, subheading, children }) {
  return (
    <AuthSplitLayout aside={<BrandAside />}
      mobileHeader={<TeamLogo height={96} />}
      footer={<p className="text-brand-gray-500">Need access? Ask a mentor to add you.</p>}>
      <div className="animate-fade-up">
        <h1 className="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-brand-black">{heading}</h1>
        {subheading && <p className="mt-2 text-sm text-brand-gray-500">{subheading}</p>}
      </div>
      {children && <div className="mt-8 animate-fade-up" style={{ animationDelay: '60ms' }}>{children}</div>}
    </AuthSplitLayout>
  )
}
