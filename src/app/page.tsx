import Spreadsheet from '@/components/Spreadsheet';
import WelcomeModal from '@/components/WelcomeModal';

export default function Home() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: '#121212' }}>
      <div className="mx-auto py-4 px-4">
        <div className="shadow-sm border border-gray-700" style={{ backgroundColor: '#121212' }}>
          <Spreadsheet />
        </div>
      </div>
      <WelcomeModal />
    </main>
  );
}
