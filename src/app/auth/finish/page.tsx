import { FragmentHandler } from './fragment-handler';

export const dynamic = 'force-dynamic';

/** Landing spot for implicit-flow links; the fragment arrives with the browser. */
export default function AuthFinishPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <FragmentHandler />
    </main>
  );
}
