import { PortCard } from '@/components/charging/port-card';

const ports = [
  { id: 'port_1', name: 'Port 1' },
  { id: 'port_2', name: 'Port 2' },
  { id: 'port_3', name: 'Port 3' },
  { id: 'lead_acid', name: 'Port 4' },
];

export default function ChargingDashboard() {
  return (
    <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-2">
      {ports.map((port) => (
        <PortCard key={port.id} portId={port.id} portName={port.name} />
      ))}
    </div>
  );
}
