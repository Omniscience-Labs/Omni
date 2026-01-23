'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function FooterSection() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDarkMode = resolvedTheme === 'dark';

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <footer id="footer" className="w-full bg-background border-t border-border">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10">
          {/* Left Section - Logo, Description, Social Icons */}
          <div className="flex flex-col items-start gap-y-4 max-w-xs">
            <Link href="/" className="flex items-center gap-2">
              {mounted && (
                <Image
                  src={isDarkMode ? '/OMNI-Logo-light.png' : '/OMNI-Logo-Dark.png'}
                  alt="OMNI"
                  width={180}
                  height={50}
                  className="h-12 w-auto"
                />
              )}
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed">
              Omni – industrial platform to build, manage and train your AI Workforce.
            </p>

            {/* Social Icons - LinkedIn and YouTube only */}
            <div className="flex items-center gap-3 mt-2">
              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/company/become-omni/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              {/* YouTube */}
              <a
                href="https://www.youtube.com/@BecomeOmni"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="currentColor"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Middle Section - Omniscience Labs */}
          <div className="flex flex-col gap-y-3">
            <h3 className="text-sm font-semibold text-amber-400 mb-1">Omniscience Labs</h3>
            <a
              href="https://www.linkedin.com/company/become-omni/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              About
            </a>
            <a
              href="mailto:socials@latent-labs.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Contact
            </a>
          </div>

          {/* Right Section - Legal */}
          <div className="flex flex-col gap-y-3">
            <h3 className="text-sm font-semibold text-amber-400 mb-1">Legal</h3>
            <Link
              href="https://becomeomni.com/legal?tab=privacy"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="https://becomeomni.com/legal?tab=terms"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

