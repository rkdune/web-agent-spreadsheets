import Spreadsheet from '@/components/Spreadsheet';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto py-4 px-4">
        <div className="bg-white shadow-sm border">
          <Spreadsheet />
        </div>
      </div>
    </main>
  );
}
