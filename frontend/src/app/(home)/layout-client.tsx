'use client';

import { Navbar } from '@/components/home/navbar';

export function HomeLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="w-full relative">
      <Navbar />
      {children}
    </div>
  );
}

