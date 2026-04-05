import json
import re
import warnings
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from apiflow_crew.crew import ApiflowCrew
from apiflow_crew.models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    GeneratedPlan,
    PlanStep,
    Assertion,
)

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("APIFlow CrewAI service starting...")
    yield
    print("APIFlow CrewAI service shutting down...")


app = FastAPI(
    title="APIFlow CrewAI Service",
    description="AI agent microservice for API test scenario planning",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_inputs(request: AnalyzeRequest) -> dict:
    """Build the interpolation inputs for YAML templates."""
    saved = [r.model_dump() for r in request.saved_requests]

    summary = "\n".join(
        f"- [{r.method}] {r.name} ({r.url})" for r in request.saved_requests
    )

    def format_body_fields(r) -> str:
        """Return the body field names so the AI knows the exact keys to use in overrides."""
        if not r.body:
            return "none"
        body = r.body.strip()
        # Replace unquoted template vars like {{varName}} with a quoted placeholder so JSON parses
        sanitized = re.sub(r'\{\{[^}]+\}\}', '"__placeholder__"', body)
        try:
            parsed = json.loads(sanitized)
            if isinstance(parsed, dict) and parsed:
                return "fields: " + ", ".join(parsed.keys())
        except Exception:
            pass
        return "none"

    detail = "\n".join(
        f"- id: {r.id}, name: {r.name}, method: {r.method}, "
        f"url: {r.url}, body_type: {r.body_type}, "
        f"body({format_body_fields(r)}), "
        f"description: {r.description}"
        for r in request.saved_requests
    )

    return {
        "command": request.command,
        "collection_name": request.collection_name,
        "saved_requests_summary": summary,
        "saved_requests_detail": detail,
    }, saved


def parse_crew_result(raw: str) -> list[dict]:
    """Parse the final crew output (JSON string) into step dicts."""
    cleaned = raw.strip()

    # Remove markdown code fences if present
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    parsed = json.loads(cleaned)

    if isinstance(parsed, dict) and "steps" in parsed:
        return parsed["steps"]
    if isinstance(parsed, list):
        return parsed

    raise ValueError(f"Unexpected crew output format: {type(parsed)}")


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """
    Receive a natural language command + saved requests from Node.js backend.
    Run the CrewAI pipeline and return a structured plan.
    """
    if not request.command.strip():
        raise HTTPException(status_code=400, detail="command is required")
    if not request.saved_requests:
        raise HTTPException(status_code=400, detail="saved_requests cannot be empty")

    try:
        inputs, saved_raw = build_inputs(request)

        crew_instance = ApiflowCrew(saved_requests=saved_raw)
        result = crew_instance.crew().kickoff(inputs=inputs)

        steps_data = parse_crew_result(result.raw)

        plan_steps = []
        for step in steps_data:
            assertions = []
            for a in step.get("assertions", []):
                a_type = a.get("type", "status_code")
            no_expected_types = {"status_success", "status_failure", "body_empty", "body_not_empty"}
            assertions.append(Assertion(
                    type=a_type,
                    field=a.get("field"),
                    expected=None if a_type in no_expected_types else a.get("expected"),
                ))

            plan_steps.append(PlanStep(
                order=step.get("order", 0),
                request_id=step.get("request_id", 0),
                actor=step.get("actor"),
                description=step.get("description", ""),
                inputs=step.get("inputs", {}),
                assertions=assertions,
            ))

        # Generate a scenario name from the command
        command_short = request.command.strip()[:60]
        scenario_name = f"Scenario - {command_short}"

        return AnalyzeResponse(
            scenario_name=scenario_name,
            plan=GeneratedPlan(steps=plan_steps),
        )

    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse crew output as JSON: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"CrewAI execution failed: {str(e)}"
        )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "apiflow-crewai"}


def start():
    """Entry point for 'serve' script command."""
    import uvicorn
    import os

    port = int(os.getenv("CREWAI_PORT", "8000"))
    uvicorn.run("apiflow_crew.server:app", host="0.0.0.0", port=port, reload=True)


if __name__ == "__main__":
    start()