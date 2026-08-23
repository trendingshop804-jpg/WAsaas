import React, { useState } from 'react';
import axios from 'axios';

function OutboundTest({ setLogs }) {
  const [toNumber, setToNumber] = useState('');
  const [status, setStatus] = useState(null); // null, 'sent', 'delivered', etc.

  const sendMessage = async () => {
    try {
      const response = await axios.post('http://localhost:5000/api/send-test', {
        to: toNumber || undefined,
      });
      const messageId = response.data.message_id;
      // Show single tick (sent)
      setStatus('sent');
      // Log outbound
      setLogs((prev) => [...prev, { outbound: true, messageId }]);
      // After a short delay, show double tick (delivered) for demo purposes
      setTimeout(() => setStatus('delivered'), 1500);
      setTimeout(() => setStatus('read'), 3000);
    } catch (err) {
      console.error('Error sending test message', err);
      setStatus('error');
    }
  };

  const tickIcon = () => {
    if (status === 'sent') {
      return <span className="text-gray-500">✓</span>; // single tick
    }
    if (status === 'delivered') {
      return <span className="text-gray-500">✓✓</span>; // double tick
    }
    if (status === 'read') {
      return <span className="text-blue-500">✓✓</span>; // blue double tick
    }
    if (status === 'error') {
      return <span className="text-red-500">✗</span>;
    }
    return null;
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
      <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Outbound Test</h2>
      <input
        type="text"
        placeholder="Recipient phone number"
        value={toNumber}
        onChange={(e) => setToNumber(e.target.value)}
        className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 mr-2 mb-2"
      />
      <button
        onClick={sendMessage}
        className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/80 transition mr-2"
      >
        Send Test Message
      </button>
      <span className="ml-2 text-lg">{tickIcon()}</span>
    </div>
  );
}

export default OutboundTest;
