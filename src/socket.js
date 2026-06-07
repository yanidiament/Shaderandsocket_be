import { io } from 'socket.io-client';

// Fetch socket URL from environment variables, fallback to window.location.origin
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

console.log(`Initializing socket connection to: ${SOCKET_URL}`);

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});
