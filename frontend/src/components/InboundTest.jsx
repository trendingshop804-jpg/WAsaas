import React from 'react';
import axios from 'axios';

function InboundTest({ setLogs }) {
  const simulate = async () => {
    const mockPayload = {
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'mock_' + Date.now(), from: '1234567890', text: { body: 'Hello from mock' } }]
          }
        }]
      }]
    };
    try {
      await axios.post('http://localhost:5000/webhook', mockPayload);
      // Log locally as well (backend also broadcasts)
      setLogs((prev) => [...prev, { simulated: true, payload: mockPayload }]);
    } catch (err) {
      console.error('Error simulating inbound', err);
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
      <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Inbound Test</h2>
      <button
        onClick={simulate}
        className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 transition"
      >
        Simulate Incoming Message
      </button>
    </div>
  );
}

export default InboundTest;
