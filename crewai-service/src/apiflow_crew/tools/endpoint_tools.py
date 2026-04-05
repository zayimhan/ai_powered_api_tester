from crewai.tools import BaseTool
from typing import Type
from pydantic import BaseModel, Field


class SearchEndpointInput(BaseModel):
    """Input schema for SearchEndpointTool."""
    keyword: str = Field(..., description="A keyword to search for in saved request names, URLs, and methods. Examples: 'register', 'login', 'POST', 'user'")


class SearchEndpointTool(BaseTool):
    name: str = "search_endpoint"
    description: str = (
        "Search through the saved API requests in the collection. "
        "Use this to find which saved request matches a scenario step. "
        "Pass a keyword like 'register', 'login', 'post', 'friend' etc. "
        "Returns matching requests with their id, name, method, and URL."
    )
    args_schema: Type[BaseModel] = SearchEndpointInput

    # This will be populated at runtime with the actual saved requests
    saved_requests: list = []

    def _run(self, keyword: str) -> str:
        keyword_lower = keyword.lower()
        matches = []

        for req in self.saved_requests:
            name = (req.get("name") or "").lower()
            url = (req.get("url") or "").lower()
            method = (req.get("method") or "").lower()
            description = (req.get("description") or "").lower()

            if (keyword_lower in name
                or keyword_lower in url
                or keyword_lower in method
                or keyword_lower in description):
                matches.append(
                    f"- id: {req['id']}, name: {req['name']}, "
                    f"method: {req['method']}, url: {req['url']}"
                )

        if not matches:
            return f"No saved requests found matching '{keyword}'. Try a different keyword."

        return f"Found {len(matches)} matching request(s):\n" + "\n".join(matches)