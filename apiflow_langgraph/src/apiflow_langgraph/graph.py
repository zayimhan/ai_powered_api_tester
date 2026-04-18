import os
from typing import Literal

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.checkpoint.memory import MemorySaver

from .state import ScenarioState
from .nodes import (
    prepare_step,
    executor_node,
    evaluator_node,
    healer_node,
    finalizer_node,
)


# ─── Routing ──────────────────────────────────────────────────────────────────

def route_after_evaluator(state: ScenarioState) -> Literal["healer", "prepare_step", "finalizer"]:
    if state.get("should_heal"):
        return "healer"

    if state.get("last_step_passed"):
        next_idx = state["current_step_index"] + 1
        if next_idx < len(state["plan_steps"]):
            return "prepare_step"
        return "finalizer"

    # Failed and cannot heal → move to next step or finalize
    next_idx = state["current_step_index"] + 1
    if next_idx < len(state["plan_steps"]):
        return "prepare_step"
    return "finalizer"


def advance_step(state: ScenarioState):
    """Prepare step node returns to prepare_step after healing — also increments index."""
    return {}


def increment_step(state: ScenarioState):
    """Called from route; we increment current_step_index before prepare_step."""
    return {"current_step_index": state["current_step_index"] + 1}


# ─── Graph routing wrappers ───────────────────────────────────────────────────
# LangGraph conditional edges need a router function, but we also need to
# advance the step index when moving to the next step.
# We handle this by routing to a thin "advance" node first.

def route_after_evaluator_with_advance(state: ScenarioState) -> Literal["healer", "advance_step", "finalizer"]:
    if state.get("should_heal"):
        return "healer"

    if state.get("last_step_passed"):
        next_idx = state["current_step_index"] + 1
        if next_idx < len(state["plan_steps"]):
            return "advance_step"
        return "finalizer"

    next_idx = state["current_step_index"] + 1
    if next_idx < len(state["plan_steps"]):
        return "advance_step"
    return "finalizer"


def advance_step_node(state: ScenarioState):
    return {
        "current_step_index": state["current_step_index"] + 1,
        "heal_attempts": 0,  # her yeni adım için sıfırla
    }


# ─── Graph builder ────────────────────────────────────────────────────────────

def build_graph_builder():
    """Returns uncompiled StateGraph — compile with checkpointer in server lifespan."""
    builder = StateGraph(ScenarioState)

    builder.add_node("prepare_step", prepare_step)
    builder.add_node("executor", executor_node)
    builder.add_node("evaluator", evaluator_node)
    builder.add_node("healer", healer_node)
    builder.add_node("advance_step", advance_step_node)
    builder.add_node("finalizer", finalizer_node)

    builder.add_edge(START, "prepare_step")
    builder.add_edge("prepare_step", "executor")
    builder.add_edge("executor", "evaluator")
    builder.add_conditional_edges(
        "evaluator",
        route_after_evaluator_with_advance,
        {
            "healer": "healer",
            "advance_step": "advance_step",
            "finalizer": "finalizer",
        },
    )
    builder.add_edge("healer", "prepare_step")
    builder.add_edge("advance_step", "prepare_step")
    builder.add_edge("finalizer", END)

    return builder
