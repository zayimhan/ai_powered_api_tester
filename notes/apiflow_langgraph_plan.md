# APIFlow — LangGraph Entegrasyon Planı

**Hedef:** Mevcut CrewAI microservice'ini **kaldırmadan**, derste işlenen LangGraph
lablarının pattern'lerini (State + StateGraph + nodes + conditional edges +
ToolNode + checkpointer + worker/evaluator loop) projenin üzerine ikinci bir AI
katmanı olarak ekleyip; CrewAI'ın yapamadığı şeyleri (adım-bazlı self-healing,
başarısız adımlarda replan, human-in-the-loop onay, checkpoint'li resume)
LangGraph'a yaptırmak.

---

## 1. Mimari Karar: CrewAI ve LangGraph birlikte nasıl yaşayacak?

### Mevcut akış (sadece CrewAI)
```
User NL Command
   ↓
Node backend /api/scenarios/analyze
   ↓
scenario-agent.service.js → CrewAI /analyze (sequential 4 agent)
   ↓ plan JSON döner
Node adımları DB'ye yazar
   ↓
/api/scenarios/:id/run
   ↓
executeScenarioPlan (deterministic for-loop)
   ↓
Her adım: resolve vars → inject token → execute HTTP → extract vars → assert
```

CrewAI sadece **planlama** yapıyor, yürütme Node tarafında düz for-loop.
Başarısızlık olduğunda otomatik toparlanma yok; kullanıcı `replan` butonuna
basmak zorunda ve o da tüm planı baştan kuruyor.

### Önerilen akış (CrewAI + LangGraph birlikte)

```
User NL Command
   ↓
Node /api/scenarios/analyze  ← DEĞİŞMEZ, hala CrewAI'e gider
   ↓
CrewAI sequential 4 agent → plan JSON
   ↓
Node plan'ı DB'ye yazar (status: planned)
   ↓
User "Run" der
   ↓
/api/scenarios/:id/run-graph   ← YENİ endpoint
   ↓
Node → LangGraph /run (FastAPI, port 8001)
   ↓
LangGraph StateGraph başlar:
   ┌─────────────────────────────────────────────────┐
   │  START                                          │
   │    ↓                                            │
   │  prepare_step (next adımı seç, vars resolve)    │
   │    ↓                                            │
   │  executor_node (HTTP çalıştır — tool call)     │
   │    ↓                                            │
   │  evaluator_node (structured output: pass/fail) │
   │    ↓                                            │
   │   conditional:                                  │
   │    ├─ passed & more steps → prepare_step       │
   │    ├─ failed & can_retry  → healer_node        │
   │    ├─ failed & cannot     → END (report)       │
   │    └─ all done            → END (report)       │
   │                                                 │
   │  healer_node: LLM-driven "fix this step"        │
   │    (örn. alternatif body, eksik header,         │
   │     saved request swap) → prepare_step          │
   └─────────────────────────────────────────────────┘
   ↓
Her adımdan sonra checkpoint (SqliteSaver ile)
   ↓
Sonuç Node'a döner → DB'de scenario_steps güncellenir
```

### Kim neyi yapacak? (sorumluluk ayrımı)

| İş | CrewAI (port 8000) | LangGraph (port 8001) |
|---|---|---|
| Doğal dil → plan üretme | ✅ (dokunulmuyor) | ❌ |
| Endpoint matching | ✅ | ❌ |
| Assertion üretme | ✅ | ❌ |
| **Adım-bazlı yürütme** | ❌ | ✅ |
| **Başarısız adımı düzeltme (self-heal)** | ❌ | ✅ |
| **Step-by-step değerlendirme** | ❌ | ✅ |
| **Checkpoint & resume** | ❌ | ✅ |
| **Human-in-the-loop onay** | ❌ | ✅ (interrupt ile) |

Bu ayrım savunmalı: CrewAI **"ne yapılacak"** planlar, LangGraph **"nasıl
yapılıyor"** yönetir. İkisi de kalır.

### Neden iki mikroservis? (Alternatifleri konuştuk mu?)

**Alternatif A:** CrewAI ve LangGraph'ı aynı Python projesine koymak.
→ Dependency çatışması riski (crewai kendi LangChain versiyonunu sabitliyor).
Modüler izolasyon kaybolur.

**Alternatif B:** LangGraph'ı Node tarafında (`@langchain/langgraph` JS
versiyonu) çalıştırmak.
→ Derste gördüğünüz tüm lablar Python. JS LangGraph daha az olgun, dersteki
pattern birebir eşleşmez. Savunurken "derste işlediğimiz şeyi aynen
uyguladık" demek daha güçlü.

**Seçilen:** İki ayrı FastAPI servisi. CrewAI 8000'de, LangGraph 8001'de.
Birbirinden habersiz, ikisiyle de Node konuşuyor.

---

## 2. Yeni LangGraph servisinin iç yapısı

Dersteki pattern'leri (özellikle `sidekick.py`) birebir takip edecek.

### 2.1 State tasarımı — `src/apiflow_langgraph/state.py`

```python
from typing import Annotated, List, Any, Optional, Dict
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class ScenarioState(TypedDict):
    # Lab 2'den: messages reducer ile biriken konuşma
    messages: Annotated[List[Any], add_messages]

    # Planlama çıktısı (CrewAI'dan gelen, değiştirilmeyen plan)
    scenario_id: int
    plan_steps: List[Dict[str, Any]]  # CrewAI'ın ürettiği adımlar

    # Yürütme durumu
    current_step_index: int            # şu an hangi adım
    context: Dict[str, Any]            # token, userId, {{UserA_id}} vb.
    run_id: str                        # unique-per-run suffix

    # Son yürütülen adımın sonucu
    last_step_result: Optional[Dict[str, Any]]  # status_code, body, assertions
    last_step_passed: Optional[bool]

    # Evaluator çıktısı (Lab 4 pattern'i)
    evaluator_feedback: Optional[str]
    success_criteria_met: bool
    should_heal: bool                  # healer_node'a git
    heal_attempts: int                 # sonsuz döngüye düşmemek için

    # Birikmiş sonuçlar — graph bittiğinde Node'a dönecek
    step_results: List[Dict[str, Any]]
    final_status: Optional[str]        # "passed", "failed", "halted"
```

**Neden TypedDict?** Lab 2–4 tamamen TypedDict kullanıyor. Lab 1'de BaseModel
denenmiş ama sonra TypedDict'e geçilmiş — hocanın tercih ettiği pattern bu.

**`add_messages` neden önemli?** Lab 1'de uzun uzun anlatılıyor: reducer'lar
state'i nasıl birleştireceğini söyler. Messages için default reducer
`add_messages` — appending yapar.

### 2.2 Evaluator için structured output — `state.py` içinde

Lab 4'teki `EvaluatorOutput` pattern'i:

```python
from pydantic import BaseModel, Field


class StepEvaluation(BaseModel):
    """LangGraph evaluator node'unun structured çıktısı."""
    passed: bool = Field(description="Whether this step met its assertions")
    feedback: str = Field(description="Why it passed or failed")
    should_heal: bool = Field(
        description="True if this failure is recoverable by modifying the step (e.g. missing header, wrong body field). False if fundamentally broken (wrong endpoint, no such user)."
    )
    heal_hint: Optional[str] = Field(
        default=None,
        description="If should_heal is True, a short hint on what to change"
    )
```

Lab 4: `evaluator_llm.with_structured_output(EvaluatorOutput)` — LLM cevabını
Pydantic model olarak zorla. Aynısını kullanacağız.

### 2.3 Node'lar — `src/apiflow_langgraph/nodes.py`

Beş node var:

#### Node 1: `prepare_step`
```python
def prepare_step(state: ScenarioState) -> Dict[str, Any]:
    """Sıradaki adımı alır, context'ten variable'ları resolve eder, request'i hazırlar."""
    idx = state["current_step_index"]
    step = state["plan_steps"][idx]
    # template resolver mantığı: Node backend'deki
    # template-resolver.js'in aynısını Python'da
    resolved = resolve_templates(step, state["context"])
    return {
        "messages": [AIMessage(content=f"Preparing step {idx + 1}: {step.get('description', '')}")],
        # executor_node bunu kullanacak
        "_prepared_request": resolved,
    }
```

#### Node 2: `executor_node` (ToolNode + chatbot pattern'i)
Lab 2'deki `ToolNode` pattern'ini burada kullanıyoruz. Tek bir tool var:
`execute_http_request` — Node backend'in `/internal/execute-raw` endpoint'ini
çağırır (veya direkt axios-eşdeğeri ile HTTP atar; ikisi de mümkün).

```python
from langchain.agents import Tool

def execute_http(config_json: str) -> str:
    """Tool: Node backend'e HTTP request config gönderir, sonucu döner."""
    import httpx, json
    r = httpx.post(
        f"{NODE_BACKEND_URL}/internal/execute-raw",
        json=json.loads(config_json),
        headers={"X-Internal-Token": INTERNAL_TOKEN},
        timeout=35,
    )
    return r.text  # JSON string — executor_node LLM'e verir


execute_tool = Tool(
    name="execute_http_request",
    func=execute_http,
    description="Executes a prepared HTTP request config and returns status/headers/body."
)
```

`executor_node`, LLM'e "bu hazırlanmış request'i çalıştır" der; LLM tool call
yapar; `ToolNode` çalışır; sonuç messages'a düşer.

**Alternatif (daha deterministic):** LLM olmadan, `executor_node` doğrudan
Python'dan HTTP atar. Bu pattern Lab 2'deki "python fonksiyonu" yaklaşımı
(Lab 1'in başındaki `our_first_node` gibi). **Öneri: bunu seçin.** LLM'e
executor'da ihtiyacımız yok — zaten plan hazır, deterministic çalıştırmak
hem ucuz hem hızlı hem güvenilir.

```python
async def executor_node(state: ScenarioState) -> Dict[str, Any]:
    req = state["_prepared_request"]
    result = await http_client.execute(req)  # Node'daki execute.service.js aynısı
    return {
        "last_step_result": result,
        "messages": [AIMessage(content=f"Step executed: {result['status_code']}")],
    }
```

#### Node 3: `evaluator_node` (Lab 4 birebir)
Sizin şu an `evaluateAssertions()` fonksiyonu Node tarafında deterministic
çalışıyor. Onu kaldırmıyoruz — sadece LangGraph'ta LLM-based bir **ikinci
katman** ekliyoruz:
- Önce deterministic assertion kontrolü (pass/fail)
- Sonra LLM evaluator: "fail ise self-heal mümkün mü?"

```python
def evaluator_node(state: ScenarioState) -> Dict[str, Any]:
    result = state["last_step_result"]
    step = state["plan_steps"][state["current_step_index"]]

    # 1) Deterministic assertion check (mevcut Node logic'inin aynısı)
    assertion_results = evaluate_assertions(step["assertions"], result, state["context"])
    det_passed = all(a["passed"] for a in assertion_results)

    if det_passed:
        return {
            "last_step_passed": True,
            "should_heal": False,
            "step_results": [...],  # sonucu append
        }

    # 2) LLM evaluator (sadece fail olunca)
    system = "You are an API test evaluator..."
    user = f"""Step description: {step['description']}
    Expected: {step['assertions']}
    Actual status: {result['status_code']}
    Actual body preview: {json.dumps(result['response_body'])[:500]}
    Can this failure be fixed by modifying the request (missing header, wrong body field, stale token)?"""

    eval_result: StepEvaluation = evaluator_llm_with_output.invoke([
        SystemMessage(content=system),
        HumanMessage(content=user)
    ])

    return {
        "last_step_passed": False,
        "should_heal": eval_result.should_heal and state["heal_attempts"] < 2,
        "evaluator_feedback": eval_result.feedback,
        "messages": [AIMessage(content=f"Evaluator: {eval_result.feedback}")],
    }
```

#### Node 4: `healer_node` (projeye özgü, derste yok ama lab pattern'i üstüne kuruyoruz)
Başarısız adımı düzelten node. Lab 4'teki "worker sees feedback, tries again"
pattern'inin API-testing'e uyarlanmış hali.

```python
def healer_node(state: ScenarioState) -> Dict[str, Any]:
    step = state["plan_steps"][state["current_step_index"]]
    feedback = state["evaluator_feedback"]
    result = state["last_step_result"]

    # LLM: bu adımı nasıl düzelteceğini söyle
    # Çıktı yine structured — Pydantic model
    class HealProposal(BaseModel):
        new_headers: Optional[Dict[str, str]] = None
        new_body_fields: Optional[Dict[str, Any]] = None
        explanation: str

    prompt = f"""This API step failed. Feedback: {feedback}
    Original request: {step}
    Response: status={result['status_code']}, body={result['response_body']}
    Propose minimal changes to fix this step."""

    proposal: HealProposal = healer_llm_with_output.invoke([...])

    # Plan'ı mutate etme — sadece bu adımın resolved_inputs'ını güncelle
    new_step = {**step}
    if proposal.new_headers:
        new_step.setdefault("inputs", {}).setdefault("headers", {}).update(proposal.new_headers)
    if proposal.new_body_fields:
        new_step.setdefault("inputs", {}).setdefault("body", {}).update(proposal.new_body_fields)

    plan_steps = state["plan_steps"][:]
    plan_steps[state["current_step_index"]] = new_step

    return {
        "plan_steps": plan_steps,
        "heal_attempts": state["heal_attempts"] + 1,
        "messages": [AIMessage(content=f"Healer: {proposal.explanation}")],
    }
```

Healer'dan sonra graph tekrar `prepare_step`'e dönecek → aynı adımı yeni
config'le tekrar çalıştıracak.

#### Node 5: `finalizer_node`
Tüm adımlar bittiğinde özet çıkarır, Node'a dönecek final JSON'u hazırlar.

### 2.4 Conditional edges — Lab 2 ve Lab 4 pattern'i

Lab 4'teki `route_based_on_evaluation` pattern'i:

```python
def route_after_evaluator(state: ScenarioState) -> str:
    # Healer'a mı, sonraki adıma mı, bitir mi?
    if state["should_heal"]:
        return "healer"
    if state["last_step_passed"]:
        if state["current_step_index"] + 1 < len(state["plan_steps"]):
            return "prepare_step"  # sonraki adım
        return "finalizer"
    # failed + heal imkânsız → yine de devam etmek istiyor muyuz?
    # Karar: kritik olmayan adımlarda devam, login gibi olanda dur.
    return "finalizer"
```

### 2.5 Graph build — `src/apiflow_langgraph/graph.py`

Lab 4'ün `sidekick.py`'ındaki `build_graph` metodunun birebir eşleniği:

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
import sqlite3


def build_graph(checkpoint_db_path: str = "langgraph_checkpoints.db"):
    builder = StateGraph(ScenarioState)

    builder.add_node("prepare_step", prepare_step)
    builder.add_node("executor", executor_node)
    builder.add_node("evaluator", evaluator_node)
    builder.add_node("healer", healer_node)
    builder.add_node("finalizer", finalizer_node)

    builder.add_edge(START, "prepare_step")
    builder.add_edge("prepare_step", "executor")
    builder.add_edge("executor", "evaluator")
    builder.add_conditional_edges(
        "evaluator",
        route_after_evaluator,
        {
            "healer": "healer",
            "prepare_step": "prepare_step",
            "finalizer": "finalizer",
        },
    )
    builder.add_edge("healer", "prepare_step")
    builder.add_edge("finalizer", END)

    # Lab 2'deki SqliteSaver — resume için
    conn = sqlite3.connect(checkpoint_db_path, check_same_thread=False)
    checkpointer = SqliteSaver(conn)

    return builder.compile(checkpointer=checkpointer)
```

**Lab 2'nin kritik cümlesi:** "Reducer handles state updates within a
super-step, but not between them. That is what checkpointing achieves."
Her `graph.ainvoke()` bir super-step; biz checkpointer sayesinde senaryo
yarıda kesilse bile `thread_id` ile devam ettirebileceğiz.

### 2.6 FastAPI server — `src/apiflow_langgraph/server.py`

CrewAI'daki `server.py` yapısının aynısı, farklı port:

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from .graph import build_graph
import uuid

app = FastAPI(title="APIFlow LangGraph Service")
graph = build_graph()


class RunRequest(BaseModel):
    scenario_id: int
    plan_steps: list
    thread_id: str | None = None  # resume için


class RunResponse(BaseModel):
    thread_id: str
    final_status: str
    step_results: list


@app.post("/run", response_model=RunResponse)
async def run(req: RunRequest):
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    initial_state = {
        "messages": [],
        "scenario_id": req.scenario_id,
        "plan_steps": req.plan_steps,
        "current_step_index": 0,
        "context": {},
        "run_id": uuid.uuid4().hex[:6],
        "last_step_result": None,
        "last_step_passed": None,
        "evaluator_feedback": None,
        "success_criteria_met": False,
        "should_heal": False,
        "heal_attempts": 0,
        "step_results": [],
        "final_status": None,
    }

    final = await graph.ainvoke(initial_state, config=config)
    return RunResponse(
        thread_id=thread_id,
        final_status=final["final_status"],
        step_results=final["step_results"],
    )


@app.post("/resume/{thread_id}")
async def resume(thread_id: str):
    """Lab 2'deki kullanım: graph.invoke(None, config) prior state'ten devam."""
    config = {"configurable": {"thread_id": thread_id}}
    final = await graph.ainvoke(None, config=config)
    return RunResponse(
        thread_id=thread_id,
        final_status=final["final_status"],
        step_results=final["step_results"],
    )


@app.get("/state/{thread_id}")
async def get_state(thread_id: str):
    """Debug — graph.get_state(config) pattern'i (Lab 2)."""
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = graph.get_state(config)
    return {"values": snapshot.values, "next": snapshot.next}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "apiflow-langgraph"}
```

---

## 3. Node backend tarafındaki değişiklikler

### 3.1 Yeni dosya: `src/services/langgraph-agent.service.js`
`scenario-agent.service.js`'in eşdeğeri ama LangGraph servisi için. Tek işi:
plan'ı al, LangGraph'a POST et, sonucu DB'ye yaz.

```javascript
const LANGGRAPH_BASE_URL = process.env.LANGGRAPH_URL || "http://localhost:8001";

async function runWithLangGraph(db, scenario, steps, userId) {
  // 1. Plan'ı LangGraph'a gönder
  const planSteps = steps.map(s => ({
    order: s.step_order,
    request_id: s.request_id,
    actor: s.actor_name,
    description: s.description,
    inputs: s.resolved_inputs || {},
    assertions: s.assertions || [],
    // Saved request detayları — LangGraph Node'a geri çağırmasın diye inline
    saved_request: requestService.getById(db, s.request_id, userId),
  }));

  const resp = await fetch(`${LANGGRAPH_BASE_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenario_id: scenario.id,
      plan_steps: planSteps,
    }),
  });

  if (!resp.ok) throw new Error(`LangGraph run failed: ${await resp.text()}`);
  const data = await resp.json();

  // 2. Step sonuçlarını DB'ye yaz
  for (let i = 0; i < steps.length; i++) {
    const stepResult = data.step_results[i];
    if (!stepResult) continue;
    scenarioService.updateStep(db, steps[i].id, {
      status: stepResult.passed ? "passed" : "failed",
      result_snapshot: stepResult,
    });
  }

  // 3. Scenario'yu güncelle
  scenarioService.updateScenario(
    db,
    scenario.id,
    { status: data.final_status },
    userId
  );

  return data;
}

module.exports = { runWithLangGraph };
```

### 3.2 Yeni route: `POST /api/scenarios/:id/run-graph`
`scenario.routes.js`'e ekleyin (`/run` endpoint'ini silmeden):

```javascript
router.post('/:id/run-graph', ctrl.runGraph);
```

`scenario.controller.js`'e:

```javascript
const langgraphAgentService = require('../services/langgraph-agent.service');

async function runGraph(req, res) {
  try {
    const scenario = scenarioService.getScenarioById(db, req.params.id, req.user.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
    const steps = scenarioService.getStepsByScenario(db, req.params.id, req.user.id);
    if (!steps?.length) return res.status(400).json({ error: 'No steps' });

    const result = await langgraphAgentService.runWithLangGraph(db, scenario, steps, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('LangGraph run error:', err);
    res.status(500).json({ error: err.message });
  }
}
```

### 3.3 DB migration: checkpoint ve heal tracking
`scenario.model.js`'i genişletmek yerine `db.js`'e migration ekleyin:

```javascript
try { db.exec("ALTER TABLE scenarios ADD COLUMN langgraph_thread_id TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE scenario_steps ADD COLUMN heal_attempts INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE scenario_steps ADD COLUMN heal_log TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE scenario_steps ADD COLUMN evaluator_feedback TEXT"); } catch(e) {}
try { db.exec("ALTER TABLE scenarios ADD COLUMN engine TEXT DEFAULT 'deterministic'"); } catch(e) {}
```

`engine` kolonu önemli: kullanıcı bir senaryoyu eski `executeScenarioPlan`
ile mi yoksa LangGraph ile mi çalıştırdığını takip etsin.

### 3.4 Internal endpoint: LangGraph HTTP request'leri buradan atsın
LangGraph servisinde doğrudan `axios` kurmak yerine, Node backend'deki
`execution.service.js`'i yeniden kullanmak daha temiz. Yeni internal route:

```javascript
// src/routes/internal.routes.js
router.post('/execute-raw', (req, res) => {
  if (req.headers['x-internal-token'] !== process.env.INTERNAL_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  executionService.execute(req.body).then(r => res.json(r));
});
```

index.js:
```javascript
app.use('/internal', require('./routes/internal.routes'));
```

---

## 4. Yazılacak dosyaların tam listesi

### LangGraph servisi (yeni Python proje, `apiflow_langgraph/` klasörü)

| Dosya | İçerik | LoC tahmini |
|---|---|---|
| `pyproject.toml` | deps: fastapi, uvicorn, langgraph, langchain-openai, pydantic, httpx, python-dotenv | ~30 |
| `src/apiflow_langgraph/__init__.py` | boş | 0 |
| `src/apiflow_langgraph/state.py` | ScenarioState + StepEvaluation + HealProposal | ~60 |
| `src/apiflow_langgraph/nodes.py` | prepare_step, executor_node, evaluator_node, healer_node, finalizer_node | ~200 |
| `src/apiflow_langgraph/graph.py` | build_graph + routing fonksiyonları | ~80 |
| `src/apiflow_langgraph/http_executor.py` | Node'un execute.service.js eşdeğeri, httpx ile | ~70 |
| `src/apiflow_langgraph/template_resolver.py` | Node'un template-resolver.js eşdeğeri | ~20 |
| `src/apiflow_langgraph/server.py` | FastAPI /run, /resume, /state, /health | ~120 |
| `.env` | OPENAI_API_KEY, NODE_BACKEND_URL, INTERNAL_TOKEN, CHECKPOINT_DB_PATH | — |

### Node backend'de eklenecekler

| Dosya | Ne yapılıyor |
|---|---|
| `src/services/langgraph-agent.service.js` | **YENİ** — LangGraph servisine proxy |
| `src/routes/internal.routes.js` | **YENİ** — LangGraph'ın geri çağırdığı execute endpoint |
| `src/routes/scenario.routes.js` | `/run-graph` route eklenir |
| `src/controllers/scenario.controller.js` | `runGraph` fonksiyonu eklenir |
| `src/database/db.js` | 5 migration satırı eklenir |
| `src/index.js` | `/internal` router mount edilir |

**Silinen hiçbir şey yok.** Mevcut `POST /:id/run` çalışmaya devam ediyor —
kullanıcı "klasik deterministic run" ile "akıllı LangGraph run" arasında seçim
yapabilir.

### Frontend (Angular) — sadece UI eklemesi

| İş | Dosya |
|---|---|
| Run paneline "Smart Run (self-healing)" toggle/buton ekleme | scenario component |
| Her adım satırında `heal_attempts > 0` göstergesi ("🔧 healed") | scenario step list |
| Evaluator feedback'i expandable detay panelinde göster | step detail |
| Thread_id'yi scenario'ya bağla, "Resume" butonu | scenario actions |

Mevcut frontend'i görmedim (attached değildi), o yüzden burada component
adlarını kesin söyleyemiyorum. Backend API şeklini değiştirmediğim için
frontend workflow'u bozulmaz; yalnızca yeni endpoint'i çağıran bir buton
ekleyeceksiniz.

---

## 5. Dersteki lab pattern'lerinin nereye düştüğü — savunmaya hazır tablo

| Dersteki konsept | Lab | Projedeki karşılığı |
|---|---|---|
| `StateGraph(State)` | 1, 2, 3, 4 | `graph.py::build_graph()` |
| TypedDict State + reducer | 2, 3, 4 | `state.py::ScenarioState` |
| `add_messages` reducer | 1, 2 | `ScenarioState.messages` |
| `add_node` / `add_edge` | 1 | `graph.py`'deki 5 node ve edge'ler |
| `add_conditional_edges` | 2, 4 | `route_after_evaluator` |
| `ToolNode` + `tools_condition` | 2, 3 | executor içinde opsiyonel; deterministic için bırakılabilir |
| LLM tool binding | 2, 3 | evaluator ve healer için |
| `MemorySaver` checkpointer | 2, 3 | local dev için |
| `SqliteSaver` checkpointer | 2 | production için — resume edilebilir senaryolar |
| `thread_id` ile super-step yönetimi | 2, 4 | her scenario run'ı unique thread_id |
| `with_structured_output(Pydantic)` | 4 | `StepEvaluation`, `HealProposal` |
| Worker + Evaluator loop | 4 | `executor` + `evaluator` + `healer` loop'u |
| `graph.ainvoke` async | 3, 4 | FastAPI endpoint'leri async |
| `graph.get_state(config)` debug | 2 | `/state/{thread_id}` endpoint'i |
| Resume from checkpoint (`invoke(None, config)`) | 2 | `/resume/{thread_id}` endpoint'i |

Bu tabloyu jüriye/hocaya göstermek: "ders boyunca işlediğimiz 15 konsept,
projemin LangGraph katmanında şu dosyalara düşüyor."

---

## 6. İş sırası (implementation order)

Bu sırayı takip etmek zorundasınız, birbirine bağımlı:

**Aşama 1 — İskelet (1 günlük iş)**
1. `apiflow_langgraph/` Python projesini oluştur (`pyproject.toml`)
2. `state.py` — State + 2 Pydantic model
3. `template_resolver.py` + `http_executor.py` — Node'un JS'lerinin Python port'u
4. `nodes.py` — 5 node'u stub olarak yaz (her biri sadece state update eder)
5. `graph.py` — build_graph, edge'ler, MemorySaver
6. `server.py` — /health ve /run endpoint'leri
7. **Test:** curl ile dummy plan gönder, 200 dön

**Aşama 2 — Node entegrasyonu (yarım gün)**
8. Node backend'de migration'ları çalıştır (db.js)
9. `langgraph-agent.service.js` yaz
10. `internal.routes.js` yaz, INTERNAL_TOKEN `.env`'e ekle
11. `scenario.controller.js`'e `runGraph` ekle, route bağla
12. **Test:** Postman'dan `/run-graph` çağır, dummy LangGraph 200 dönsün

**Aşama 3 — Node'lar gerçekleşiyor (1–2 gün)**
13. `prepare_step`: template resolver + email uniquification portu
14. `executor_node`: http_executor üzerinden gerçek HTTP
15. `evaluator_node`: deterministic assertion + (pass/fail yeterli, LLM bir sonraki)
16. `finalizer_node`: step_results derle
17. **Test:** CrewAI'dan gelen gerçek bir plan'ı LangGraph ile çalıştır;
    CrewAI'sız basit deterministic akış çalışsın

**Aşama 4 — Akıllı katman (1–2 gün)**
18. `evaluator_node`'a LLM structured output ekle (Lab 4 pattern'i)
19. `healer_node` yaz, `HealProposal` ile
20. `route_after_evaluator` conditional edge
21. `heal_attempts` limit (maks 2) — sonsuz döngü koruması
22. **Test:** Kasten bozuk plan üret (yanlış body field), healer düzeltiyor mu?

**Aşama 5 — Checkpoint & resume (yarım gün)**
23. MemorySaver → SqliteSaver'a geç
24. `/resume/{thread_id}` endpoint'i
25. `/state/{thread_id}` debug endpoint'i
26. Scenario tablosuna `langgraph_thread_id` kaydet
27. **Test:** Senaryo yarıda kesildi, resume ile devam ediyor mu?

**Aşama 6 — Frontend toggle (yarım gün)**
28. "Smart Run" butonu ve `engine` seçimi
29. Her step satırında `heal_attempts` göster
30. Evaluator feedback'i modal/expander'a

**Aşama 7 — Polish**
31. Hata mesajları
32. Timeout handling (LangGraph uzun sürebilir; Node tarafında 120s timeout)
33. Logging (langsmith opsiyonel ama Lab 2'de bahsediliyor — eklerseniz güzel bonus)

Toplam: ~5–6 gün focused iş.

---

## 7. Dikkat edilmesi gereken riskli noktalar

1. **Sonsuz healer döngüsü.** `heal_attempts >= 2` kontrolünü
   `route_after_evaluator`'a KESINLIKLE koyun. Yoksa token'ı bozuk bir
   adım sonsuza kadar LLM tüketir.

2. **CrewAI'dan gelen plan'ın şeması LangGraph'ta aynı kalmalı.** Şu an
   CrewAI `step.inputs.body`/`step.inputs.headers` üretiyor, `{{varName}}`
   syntax'ı kullanıyor. LangGraph'taki `template_resolver.py`'nin bu
   syntax'ı aynen desteklemesi şart — Node'daki JS resolver'ı birebir
   port edin, yaratıcılık yok.

3. **Email/username uniquification.** Şu an `scenario-agent.service.js`'te
   200 satırlık subtle logic var (runId, actorSlug, existsInContext,
   created_ prefix'i vb.). Bunu Python'a port ederken birebir yapın —
   en az 10 edge case var, yeniden icat etmeye kalkarsanız multi-actor
   senaryoları bozulur.

4. **Actor-specific token injection** (`UserA_token`, `UserB_token`).
   `executor_node`'da bu logic olmalı, `prepare_step`'te değil — çünkü
   healer tokeni değiştirebilir, prepare'de dondurursanız iki tur sonra
   stale olur.

5. **Checkpointer concurrent access.** SqliteSaver'ı Node'un kullandığı
   `apiflow.db` ile paylaşmayın — **ayrı** bir dosya (`langgraph_checkpoints.db`).
   Aynı SQLite'ı iki proses yazarsa lock sorunu çıkar.

6. **`.env` dosyalarını karıştırmayın.** CrewAI'ın `OPENAI_API_KEY`'i ile
   LangGraph'ınki aynı key olsa bile iki ayrı `.env` olsun; iki servisi
   farklı Python venv'lerde çalıştırın. crewai paketinin pinlediği
   langchain versiyonu ile langgraph'ın istediği çakışabilir.

7. **CORS ve port.** LangGraph 8001'de çalışsın (CrewAI 8000'de); Angular
   doğrudan LangGraph'a *konuşmasın* — sadece Node üzerinden proxy. Bu
   token/yetki yönetimini basit tutar.

---

## 8. "Minimum viable" sürüm — bunu yaparsanız savunulabilir

Eğer zaman kısıtlıysa, şunlarla bile tam puan alırsınız:

- `state.py` + `graph.py` + `server.py` (Aşama 1)
- Deterministic executor + evaluator (LLM'siz) — Aşama 3
- `/run-graph` Node endpoint'i — Aşama 2
- SqliteSaver checkpointer — Aşama 5'in yarısı
- Healer'ı **stub** bırakın (TODO olarak), evaluator her zaman
  `should_heal = False` döndürsün. Mimari tam, sadece heal LLM çağrısı yok.

Bu minimum sürümde bile dersteki şu pattern'ler **somut** olarak var:
StateGraph, TypedDict state, add_messages reducer, conditional edges,
checkpointing, thread_id super-step, ainvoke. Hoca hepsini görür.

Sonra zaman kalırsa healer'ı gerçek LLM'e bağlayın — projenin "+"
özelliği olarak sunarsınız.

---

## 9. Test senaryosu önerisi — savunmada kullanmak için

**Senaryo:** "UserA kaydol, login ol, bir post oluştur, post endpoint'i
'authorization' header bekliyor ama saved request'te yok."

- **Klasik `/run`:** Post adımı 401 döner, senaryo fails.
- **LangGraph `/run-graph`:** Post adımı 401 döner → evaluator
  `should_heal=True`, `heal_hint="missing Authorization header"` →
  healer ekler → prepare_step tekrar çalışır → adım passes.

Bu senaryoyu canlı çalıştırmak savunmanın "wow" anı olur.

---

## Sonuç

Plan net, dersten sapmıyor, CrewAI'a dokunmuyor, mevcut deterministic
executor'ı kırmıyor. LangGraph sadece **ikinci bir yürütme motoru** olarak
eklenip; Lab 1–4'teki 15 küsur konsepti somut dosyalara eşliyor. Minimum
viable sürümde bile ders pattern'i tam temsil ediliyor, tam sürümde
projenin gerçek bir "AI-powered"/"self-healing" API tester kimliği kazanıyor.
