from enum import Enum


class RunStatus(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"
    review_needed = "review_needed"


class NodeType(str, Enum):
    idea = "idea"
    plan = "plan"
    code = "code"
    test = "test"
    pr = "pr"
