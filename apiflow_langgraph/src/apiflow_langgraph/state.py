from typing import Annotated, List, Any, Optional, Dict
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class ScenarioState(TypedDict):
    # Lab 2: messages reducer ile biriken konuşma geçmişi
    messages: Annotated[List[Any], add_messages]

    # CrewAI'dan gelen plan (değiştirilmez, sadece healer adım mutate eder)
    scenario_id: int
    plan_steps: List[Dict[str, Any]]

    # Yürütme durumu
    current_step_index: int
    context: Dict[str, Any]   # token, userId, {{UserA_id}} vb.
    run_id: str

    # Son yürütülen adımın sonucu
    last_step_result: Optional[Dict[str, Any]]
    last_step_passed: Optional[bool]

    # Evaluator çıktısı (Lab 4 pattern'i)
    evaluator_feedback: Optional[str]
    success_criteria_met: bool
    should_heal: bool
    heal_attempts: int

    # prepare_step → executor_node arası geçici veri
    _prepared_request_json: Optional[str]

    # Birikmiş sonuçlar — graph bittiğinde Node'a dönecek
    step_results: List[Dict[str, Any]]
    final_status: Optional[str]   # "passed", "failed", "halted"


class StepEvaluation(BaseModel):
    """Lab 4 evaluator node'unun structured çıktısı."""
    passed: bool = Field(description="Whether this step met its assertions")
    feedback: str = Field(description="Why it passed or failed")
    should_heal: bool = Field(
        description="True if failure is recoverable by modifying the step (missing header, wrong body field). False if fundamentally broken."
    )
    heal_hint: Optional[str] = Field(
        default=None,
        description="If should_heal is True, a short hint on what to change"
    )


class HealProposal(BaseModel):
    """Healer node'unun structured çıktısı."""
    new_headers: Optional[Dict[str, str]] = Field(default=None)
    new_body_fields: Optional[Dict[str, Any]] = Field(default=None)
    explanation: str = Field(description="What was changed and why")
