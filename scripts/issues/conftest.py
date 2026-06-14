import pytest

from memory import InMemoryTracker
from tracker import IssueTracker


@pytest.fixture
def tracker() -> IssueTracker:
    return InMemoryTracker()
