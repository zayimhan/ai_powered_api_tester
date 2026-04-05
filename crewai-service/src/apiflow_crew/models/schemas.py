from pydantic import BaseModel, Field
from typing import Optional


class SavedRequestInfo(BaseModel):
    """A saved request from the user's collection."""
    id: int
    name: str
    description: str = ""
    method: str
    url: str
    headers: dict = Field(default_factory=dict)
    body: Optional[str] = None
    body_type: str = "none"


class AnalyzeRequest(BaseModel):
    """Incoming request from Node.js backend to analyze a scenario."""
    command: str
    saved_requests: list[SavedRequestInfo]
    collection_name: str = ""


class Assertion(BaseModel):
    type: str
    field: Optional[str] = None
    expected: Optional[str | int | float] = None


class PlanStep(BaseModel):
    order: int
    request_id: int
    actor: Optional[str] = None
    description: str = ""
    inputs: dict = Field(default_factory=dict)
    assertions: list[Assertion] = Field(default_factory=list)


class GeneratedPlan(BaseModel):
    steps: list[PlanStep]


class AnalyzeResponse(BaseModel):
    """Response back to Node.js backend."""
    scenario_name: str
    plan: GeneratedPlan