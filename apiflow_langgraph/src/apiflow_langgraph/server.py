import os
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

load_dotenv()

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver  # noqa: E402
from langgraph.checkpoint.memory import MemorySaver           # noqa: E402
from .graph import build_graph_builder                        # noqa: E402

# ─── App state ────────────────────────────────────────────────────────────────

_graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _graph
    db_path = os.environ.get("CHECKPOINT_DB_PATH") or "langgraph_checkpoints.db"
    builder = build_graph_builder()

    async with AsyncSqliteSaver.from_conn_string(db_path) as checkpointer:
        _graph = builder.compile(checkpointer=checkpointer)
        yield
    # cleanup on shutdown


app = FastAPI(title="APIFlow LangGraph Service", lifespan=lifespan)


def get_graph():
    if _graph is None:
        raise RuntimeError("Graph not initialized")
    return _graph


# ─── Request / Response models ────────────────────────────────────────────────

class RunRequest(BaseModel):
    scenario_id: int
    plan_steps: list
    context: dict = {}
    thread_id: Optional[str] = None


class RunResponse(BaseModel):
    thread_id: str
    final_status: str
    step_results: list


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/run", response_model=RunResponse)
async def run(req: RunRequest):
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    run_id = uuid.uuid4().hex[:6]

    initial_state = {
        "messages": [],
        "scenario_id": req.scenario_id,
        "plan_steps": req.plan_steps,
        "current_step_index": 0,
        "context": req.context or {},
        "run_id": run_id,
        "last_step_result": None,
        "last_step_passed": None,
        "_prepared_request_json": None,
        "evaluator_feedback": None,
        "success_criteria_met": False,
        "should_heal": False,
        "heal_attempts": 0,
        "step_results": [],
        "final_status": None,
    }

    try:
        final = await get_graph().ainvoke(initial_state, config=config)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return RunResponse(
        thread_id=thread_id,
        final_status=final.get("final_status") or "failed",
        step_results=final.get("step_results") or [],
    )


@app.post("/resume/{thread_id}", response_model=RunResponse)
async def resume(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    try:
        final = await get_graph().ainvoke(None, config=config)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return RunResponse(
        thread_id=thread_id,
        final_status=final.get("final_status") or "failed",
        step_results=final.get("step_results") or [],
    )


@app.get("/state/{thread_id}")
async def get_state(thread_id: str):
    config = {"configurable": {"thread_id": thread_id}}
    try:
        snapshot = get_graph().get_state(config)
        return {"values": snapshot.values, "next": list(snapshot.next)}
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "apiflow-langgraph"}


def start():
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("apiflow_langgraph.server:app", host="0.0.0.0", port=port, reload=False)
