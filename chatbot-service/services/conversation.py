from collections import defaultdict
from threading import Lock
from typing import Dict, List

from models.schemas import Message


class ConversationManager:
    def __init__(self) -> None:
        self._conversations: Dict[str, List[Message]] = defaultdict(list)
        self._lock = Lock()

    def get_history(self, user_id: str) -> List[Message]:
        with self._lock:
            return list(self._conversations.get(user_id, []))

    def append(self, user_id: str, message: Message) -> None:
        with self._lock:
            self._conversations[user_id].append(message)

    def clear(self, user_id: str) -> None:
        with self._lock:
            if user_id in self._conversations:
                del self._conversations[user_id]
