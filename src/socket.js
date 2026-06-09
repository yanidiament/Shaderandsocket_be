import { io } from 'socket.io-client';

// In production (Render), the Socket.io server runs on the same origin.
// In development, you can override with VITE_SOCKET_URL.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

console.log(`Initializing socket connection to: ${SOCKET_URL}`);

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});
