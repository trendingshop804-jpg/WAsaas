import React, { useEffect, useState } from 'react';
import ConnectionStatus from './components/ConnectionStatus';
import InboundTest from './components/InboundTest';
import OutboundTest from './components/OutboundTest';
import LogWindow from './components/LogWindow';
import './index.css';

function App() {
  const [logs, setLogs] = useState([]);

  // Initialize WebSocket connection
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5000/ws');
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'log') {
        setLogs((prev) => [...prev, msg.data]);
      }
    };
    ws.onerror = (err) => console.error('WebSocket error', err);
    return () => ws.close();
  }, []);

  return (
    <div className="min-h-screen flex flex-col p-4 bg-gray-50 dark:bg-gray-900">
      <h1 className="text-2xl font-bold mb-4 text-center text-gray-800 dark:text-gray-200">
        WhatsApp CRM Tester Dashboard
      </h1>
      <ConnectionStatus />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <InboundTest setLogs={setLogs} />
        <OutboundTest setLogs={setLogs} />
      </div>
      <LogWindow logs={logs} />
    </div>
  );
}

export default App;
