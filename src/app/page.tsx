

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 bg-gradient-to-br from-neutral-900 to-black">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        {/* Company Logo */}
        <div className="flex flex-col items-center gap-6">
          <img 
            src="/golden-attentive-logo.svg" 
            alt="Golden Attentive" 
            className="h-20 w-auto"
          />
          <div className="text-center text-white/60">
            <span className="text-sm">Customer Care Management System</span>
          </div>
        </div>
        <div className="text-center text-white/80 space-y-4">
          <h2 className="text-2xl font-semibold">Customer Care Management System</h2>
          <p className="text-white/60 max-w-md">
            Streamline your customer support operations with our integrated task management and analytics platform.
          </p>
        </div>

        <div className="flex gap-4 items-center flex-col sm:flex-row">
          <a
            className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-blue-600 text-white gap-2 hover:bg-blue-700 font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            href="/manager"
          >
            Manager Dashboard
          </a>
          <a
            className="rounded-full border border-solid border-white/20 transition-colors flex items-center justify-center hover:bg-white/10 text-white font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
            href="/agent"
          >
            Agent Portal
          </a>
        </div>
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center text-white/40 text-sm">
        <div className="flex items-center gap-2">
          <span>© 2024 Golden Customer Care</span>
        </div>
        <div className="flex items-center gap-2">
          <span>Built with Next.js & Attentive Platform</span>
        </div>
      </footer>
    </div>
  );
}
