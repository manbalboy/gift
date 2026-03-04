from pydantic import BaseModel


class AgentTaskRequest(BaseModel):
    node_id: str
    node_name: str
    payload: dict


class AgentTaskResult(BaseModel):
    ok: bool
    log: str
    output: dict
