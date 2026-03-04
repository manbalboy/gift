from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkflowNode(BaseModel):
    id: str
    type: str = 'task'
    label: str


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str


class WorkflowGraph(BaseModel):
    nodes: list[WorkflowNode] = Field(default_factory=list)
    edges: list[WorkflowEdge] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_graph(self) -> "WorkflowGraph":
        if len(self.nodes) < 1:
            raise ValueError("workflow graph must include at least one node")

        node_ids = {node.id for node in self.nodes}
        if len(node_ids) != len(self.nodes):
            raise ValueError("duplicate node id detected")

        adjacency: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
        indegree: dict[str, int] = {node_id: 0 for node_id in node_ids}
        for edge in self.edges:
            if edge.source not in node_ids or edge.target not in node_ids:
                raise ValueError("edge must reference existing nodes")
            adjacency[edge.source].append(edge.target)
            indegree[edge.target] += 1

        queue = [node_id for node_id, degree in indegree.items() if degree == 0]
        visited = 0
        while queue:
            node_id = queue.pop(0)
            visited += 1
            for target in adjacency[node_id]:
                indegree[target] -= 1
                if indegree[target] == 0:
                    queue.append(target)

        if visited != len(node_ids):
            raise ValueError("workflow graph cannot include cycles")

        return self


class WorkflowCreate(BaseModel):
    name: str
    description: str = ''
    graph: WorkflowGraph


class WorkflowUpdate(BaseModel):
    name: str
    description: str = ''
    graph: WorkflowGraph


class WorkflowOut(BaseModel):
    id: int
    name: str
    description: str
    graph: WorkflowGraph
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NodeRunOut(BaseModel):
    id: int
    node_id: str
    node_name: str
    status: str
    sequence: int
    log: str
    artifact_path: str | None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkflowRunOut(BaseModel):
    id: int
    workflow_id: int
    status: str
    started_at: datetime
    updated_at: datetime
    node_runs: list[NodeRunOut]

    model_config = ConfigDict(from_attributes=True)


class RunEventOut(BaseModel):
    run_id: int
    status: str
    node_statuses: dict[str, str]
    updated_at: datetime
