from crewai import Agent, Crew, Process, Task
from crewai.project import CrewBase, agent, crew, task

from apiflow_crew.tools.endpoint_tools import SearchEndpointTool


@CrewBase
class ApiflowCrew():
    """APIFlow Scenario Agent crew"""

    agents_config = 'config/agents.yaml'
    tasks_config = 'config/tasks.yaml'

    def __init__(self, saved_requests: list = None):
        super().__init__()
        self.saved_requests_data = saved_requests or []
        self.search_tool = SearchEndpointTool(
            saved_requests=self.saved_requests_data
        )

    # ─── Agents ───

    @agent
    def scenario_parser(self) -> Agent:
        return Agent(
            config=self.agents_config['scenario_parser'],
            verbose=True
        )

    @agent
    def endpoint_matcher(self) -> Agent:
        return Agent(
            config=self.agents_config['endpoint_matcher'],
            tools=[self.search_tool],
            verbose=True
        )

    @agent
    def plan_generator(self) -> Agent:
        return Agent(
            config=self.agents_config['plan_generator'],
            verbose=True
        )

    @agent
    def assertion_generator(self) -> Agent:
        return Agent(
            config=self.agents_config['assertion_generator'],
            verbose=True
        )

    # ─── Tasks ───

    @task
    def parse_scenario(self) -> Task:
        return Task(
            config=self.tasks_config['parse_scenario'],
        )

    @task
    def match_endpoints(self) -> Task:
        return Task(
            config=self.tasks_config['match_endpoints'],
        )

    @task
    def generate_plan(self) -> Task:
        return Task(
            config=self.tasks_config['generate_plan'],
        )

    @task
    def generate_assertions(self) -> Task:
        return Task(
            config=self.tasks_config['generate_assertions'],
        )

    # ─── Crew ───

    @crew
    def crew(self) -> Crew:
        """Creates the APIFlow scenario crew"""
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )