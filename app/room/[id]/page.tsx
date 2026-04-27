type Params = Promise<{ id: string }>;

export default async function RoomPlaceholder({ params }: { params: Params }) {
  const { id } = await params;
  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">You&apos;re in! 🧘</h1>
        <p className="text-gray-600">
          Room <code className="font-mono">{id}</code>
        </p>
        <p className="text-sm text-gray-500">
          Watch room arrives in Phase 3. Your signup is saved.
        </p>
      </div>
    </main>
  );
}
