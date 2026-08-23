import React from 'react';

function ConnectionStatus() {
  return (
    <div className="flex items-center space-x-2 mb-2">
      <span className="font-medium text-gray-700 dark:text-gray-300">Connection Status:</span>
      <span className="status-dot"></span>
      <span className="text-green-600 dark:text-green-400">Connected</span>
    </div>
  );
}

export default ConnectionStatus;
