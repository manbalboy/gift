from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgentTaskRequest(BaseModel):
    node_id: str
    node_name: str
    payload: dict


class AgentTaskResult(BaseModel):
    ok: bool
    log: str
    output: dict


class AgentBase(BaseModel):
    name: str
    slug: str
    description: str = ""
    version: str = "1.0.0"
    status: str = "active"
    input_schema: dict = Field(default_factory=dict)
    output_schema: dict = Field(default_factory=dict)
    tools: list[str] = Field(default_factory=list)
    prompt_policy: dict = Field(default_factory=dict)
    template_package: str = ""


class AgentCreate(AgentBase):
    pass


class AgentUpdate(AgentBase):
    pass


class AgentOut(AgentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
