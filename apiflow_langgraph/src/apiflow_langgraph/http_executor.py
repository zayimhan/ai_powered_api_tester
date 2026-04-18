import json
import time
from typing import Any, Dict, Optional

import httpx


async def execute(request_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Node backend'deki execution.service.js'in async Python portu.
    Dışarıya HTTP isteği atar, normalize sonuç döner.
    """
    method = (request_config.get("method") or "GET").upper()
    url = (request_config.get("url") or "").strip()
    headers = dict(request_config.get("headers") or {})
    query_params = request_config.get("query_params") or {}
    body = request_config.get("body")
    body_type = (request_config.get("body_type") or "none").lower()

    final_body: Any = None
    lower_headers = {k.lower(): k for k in headers}

    if body_type == "json" and body:
        if "content-type" not in lower_headers:
            headers["Content-Type"] = "application/json"
        if isinstance(body, str):
            try:
                final_body = json.loads(body)
            except Exception:
                final_body = body
        else:
            final_body = body

    elif body_type == "form-data" and body:
        if "content-type" not in lower_headers:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        if isinstance(body, str):
            try:
                parsed = json.loads(body)
                if isinstance(parsed, dict):
                    final_body = "&".join(
                        f"{k}={v}" for k, v in parsed.items()
                    )
                else:
                    final_body = body
            except Exception:
                final_body = body
        else:
            final_body = body

    elif body_type == "raw" and body:
        if "content-type" not in lower_headers:
            headers["Content-Type"] = "text/plain"
        final_body = body

    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=query_params if query_params else None,
                json=final_body if body_type == "json" else None,
                content=final_body if body_type != "json" else None,
            )
        elapsed = int((time.monotonic() - start) * 1000)

        try:
            response_body = resp.json()
        except Exception:
            response_body = resp.text

        return {
            "status_code": resp.status_code,
            "response_time_ms": elapsed,
            "response_headers": dict(resp.headers),
            "response_body": response_body,
            "success": 200 <= resp.status_code < 300,
        }

    except Exception as exc:
        elapsed = int((time.monotonic() - start) * 1000)
        return {
            "status_code": 0,
            "response_time_ms": elapsed,
            "response_headers": {},
            "response_body": None,
            "success": False,
            "error_message": str(exc),
        }
