import React from 'react';

function LogWindow({ logs }) {
  return (
    <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded shadow log-window">
      <h3 className="text-md font-medium mb-2 text-gray-800 dark:text-gray-200">Log Window</h3>
      <div className="h-48 overflow-y-auto">
        {logs.map((log, idx) => (
          <pre key={idx} className="text-xs bg-gray-100 dark:bg-gray-700 p-1 rounded mb-1">
            {JSON.stringify(log, null, 2)}
          </pre>
        ))}
      </div>
    </div>
  );
}

export default LogWindow;
