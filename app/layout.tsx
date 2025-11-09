import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Zest Fulcrum",
  description: "Dermatology Biologic Decision Support System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-white border-b">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-16 items-center">
                <div className="flex items-center space-x-8">
                  <Link href="/" className="text-2xl font-bold text-primary-600">
                    Zest Fulcrum
                  </Link>
                  <div className="hidden md:flex space-x-6">
                    <Link href="/patients" className="text-gray-700 hover:text-primary-600">
                      Patients
                    </Link>
                    <Link href="/assess" className="text-gray-700 hover:text-primary-600">
                      New Assessment
                    </Link>
                    <Link href="/admin" className="text-gray-700 hover:text-primary-600">
                      Data Upload
                    </Link>
                  </div>
                </div>
              </div>
            </nav>
          </header>

          <main className="flex-1">
            {children}
          </main>

          <footer className="bg-white border-t mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <p className="text-center text-sm text-gray-500">
                Zest Biologic Decision Support System &copy; {new Date().getFullYear()}
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
