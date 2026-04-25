"""
SSE Service — Server-Sent Events broadcaster
=============================================
Thread-safe event queue that fans out events to all connected SSE clients.

Usage (from any backend module):
    from services.trading.sse_service import sse_service
    sse_service.push('trade_result', {'trade_id': '...', 'result': 'win', 'profit': 8.5})
"""
import json
import queue
import threading
import logging

logger = logging.getLogger(__name__)


class SSEService:
    """Broadcasts server-sent events to every connected client."""

    def __init__(self):
        self._clients: list[queue.Queue] = []
        self._lock = threading.Lock()

    def subscribe(self) -> queue.Queue:
        """Register a new SSE client. Returns its dedicated Queue."""
        q: queue.Queue = queue.Queue(maxsize=100)
        with self._lock:
            self._clients.append(q)
        logger.debug(f"SSE client connected. Total: {len(self._clients)}")
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        """Remove a disconnected client's queue."""
        with self._lock:
            try:
                self._clients.remove(q)
            except ValueError:
                pass
        logger.debug(f"SSE client disconnected. Total: {len(self._clients)}")

    def push(self, event_type: str, data: dict) -> None:
        """
        Broadcast an SSE event to every connected client.
        Silently drops the event for full queues (client too slow / dead).
        """
        msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
        with self._lock:
            dead: list[queue.Queue] = []
            for q in self._clients:
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    dead.append(q)
            for q in dead:
                self._clients.remove(q)
            if dead:
                logger.warning(f"Dropped SSE event for {len(dead)} slow/dead client(s).")

    @property
    def client_count(self) -> int:
        with self._lock:
            return len(self._clients)


sse_service = SSEService()
