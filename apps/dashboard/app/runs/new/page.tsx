import Link from 'next/link';

export default function NewRunPage() {
  return (
    <>
      <div className="mb-6">
        <Link href="/runs" className="text-xs text-slate-400 hover:text-slate-600">← Runs</Link>
        <h1 className="text-xl font-semibold mt-1">New Run</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-sm">
        Run creation coming soon. Use the <code className="font-mono bg-slate-100 px-1 rounded text-slate-600">vaeo blueprint</code> CLI to start a new run.
      </div>
    </>
  );
}
