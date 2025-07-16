from ..protocols import MCPQualifiedNameService
from ..domain.value_objects import AppSlug


class MCPQualifiedNameService:
    def generate(self, app_slug: AppSlug) -> str:
        return f"pipedream:{app_slug.value}" 