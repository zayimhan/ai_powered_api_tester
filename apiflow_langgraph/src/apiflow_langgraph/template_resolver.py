import json
import re
from typing import Any, Dict


def resolve(template: Any, variables: Dict[str, Any]) -> Any:
    """
    Node backend'deki template-resolver.js'in birebir Python portu.
    {{variableName}} şablonlarını context değerleriyle değiştirir.
    """
    serialized = json.dumps(template)
    for key, value in variables.items():
        safe_value = json.dumps(str(value))[1:-1]  # outer quotes stripped
        serialized = serialized.replace("{{" + key + "}}", safe_value)
    return json.loads(serialized)


def has_unresolved(value: str) -> bool:
    """Değer hâlâ çözülmemiş {{...}} içeriyor mu?"""
    return bool(re.search(r"\{\{[^}]+\}\}", str(value)))
