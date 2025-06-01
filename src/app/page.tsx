import Spreadsheet from '@/components/Spreadsheet';

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4">
        <div className="bg-white rounded-lg shadow-sm border">
          <Spreadsheet />
        </div>
      </div>
    </main>
  );
}
