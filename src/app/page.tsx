import ChargingDashboard from '@/components/charging/charging-dashboard';
import Header from '@/components/common/header';

export default function Home() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-background overflow-x-hidden">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-2 sm:p-4 md:gap-8 md:p-8">
        <ChargingDashboard />
      </main>
    </div>
  );
}
