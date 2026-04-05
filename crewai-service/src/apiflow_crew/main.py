import sys
import warnings
import json
from dotenv import load_dotenv
load_dotenv()

from apiflow_crew.crew import ApiflowCrew

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")


def run():
    """
    Run the crew locally for testing.
    """

    # Example saved requests (simulating a social app collection)
    saved_requests = [
        {
            "id": 1,
            "name": "Register User",
            "description": "Register a new user account",
            "method": "POST",
            "url": "http://localhost:4000/api/auth/register",
            "headers": {"Content-Type": "application/json"},
            "body": '{"username": "testuser", "email": "test@example.com", "password": "123456"}',
            "body_type": "json"
        },
        {
            "id": 2,
            "name": "Login User",
            "description": "Login and get JWT token",
            "method": "POST",
            "url": "http://localhost:4000/api/auth/login",
            "headers": {"Content-Type": "application/json"},
            "body": '{"email": "test@example.com", "password": "123456"}',
            "body_type": "json"
        },
        {
            "id": 3,
            "name": "Create Post",
            "description": "Create a new post",
            "method": "POST",
            "url": "http://localhost:4000/api/posts",
            "headers": {"Content-Type": "application/json", "Authorization": "Bearer {{token}}"},
            "body": '{"title": "Hello World", "content": "My first post"}',
            "body_type": "json"
        },
        {
            "id": 4,
            "name": "Get User Feed",
            "description": "Get the feed for a user",
            "method": "GET",
            "url": "http://localhost:4000/api/feed",
            "headers": {"Authorization": "Bearer {{token}}"},
            "body": None,
            "body_type": "none"
        }
    ]

    # Build summary strings for YAML interpolation
    summary = "\n".join(
        f"- [{r['method']}] {r['name']} ({r['url']})" for r in saved_requests
    )

    detail = "\n".join(
        f"- id: {r['id']}, name: {r['name']}, method: {r['method']}, "
        f"url: {r['url']}, body_type: {r['body_type']}, "
        f"description: {r.get('description', '')}"
        for r in saved_requests
    )

    inputs = {
        "command": "Register a new user, login with that user, create a post, then check the feed to verify the post appears.",
        "collection_name": "Social App API",
        "saved_requests_summary": summary,
        "saved_requests_detail": detail,
    }

    try:
        crew = ApiflowCrew(saved_requests=saved_requests)
        result = crew.crew().kickoff(inputs=inputs)
        print("\n========== FINAL RESULT ==========")
        print(result.raw)
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")


if __name__ == "__main__":
    run()