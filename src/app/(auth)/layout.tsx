import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-6 pb-safe">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-paper-dim hover:text-paper"
      >
        <ArrowLeft className="size-4" />
        Back
      </Link>
      {children}
    </main>
  );
}
