"""
Tool Billing Service

Encapsulates all tool-level credit operations:
  - Pre-flight check  (can the user afford to run this tool?)
  - Post-execution deduction (charge the user after a successful tool call)

Both Enterprise and SaaS paths are handled here so callers never need
to know which billing mode is active.
"""

from decimal import Decimal
from typing import Dict, List, Optional

from core.billing.credits.manager import credit_manager
from core.services.supabase import DBConnection
from core.utils.config import config, EnvMode
from core.utils.logger import logger
from core.billing.shared.cache_utils import invalidate_account_state_cache


class ToolBillingService:
    """
    Centralised service for per-tool credit checks and deductions.

    Callers should use the public methods:

        can_use_tool        -- lightweight read-only check for a single tool
        can_use_tools_batch -- lightweight read-only check for multiple tools
        deduct_tool         -- atomic deduction (call after a successful tool execution)
    """

    # ------------------------------------------------------------------ #
    #  Pre-flight check
    # ------------------------------------------------------------------ #

    async def can_use_tool(
        self,
        account_id: str,
        tool_name: str,
    ) -> Dict:
        """
        Check whether *account_id* can afford to execute *tool_name*.

        Returns
        -------
        dict
            Always contains ``can_use: bool``.
            On success also contains ``required_cost``, ``current_balance``,
            and ``user_remaining``.
        """
        if config.ENV_MODE == EnvMode.LOCAL:
            return {"can_use": True, "required_cost": 0, "reason": "local_mode"}

        try:
            if config.ENTERPRISE_MODE:
                return await self._enterprise_can_use_tool(account_id, tool_name)
            else:
                return await self._saas_can_use_tool(account_id, tool_name)
        except Exception as e:
            logger.error(f"[TOOL_BILLING] Error in can_use_tool for {account_id}/{tool_name}: {e}")
            # Fail-open: don't block tool execution on billing errors
            return {"can_use": True, "required_cost": 0, "reason": "check_error", "error": str(e)}

    # ------------------------------------------------------------------ #
    #  Batch pre-flight check
    # ------------------------------------------------------------------ #

    async def can_use_tools_batch(
        self,
        account_id: str,
        tool_names: List[str],
    ) -> Dict:
        """
        Check whether *account_id* can afford to execute **all** tools in
        *tool_names* at once.

        For a single tool this delegates to :meth:`can_use_tool`.

        Returns
        -------
        dict
            Always contains ``can_use: bool`` and ``total_cost: float``.
            Enterprise responses additionally include ``current_balance``
            and ``user_remaining``.
        """
        if config.ENV_MODE == EnvMode.LOCAL:
            return {"can_use": True, "total_cost": 0, "reason": "local_mode"}

        if not tool_names:
            return {"can_use": True, "total_cost": 0, "reason": "no_tools"}

        # Single-tool fast path – reuse the existing method
        if len(tool_names) == 1:
            result = await self.can_use_tool(account_id, tool_names[0])
            # Normalise keys so callers always see total_cost
            result.setdefault("total_cost", result.get("required_cost", 0))
            return result

        try:
            if config.ENTERPRISE_MODE:
                return await self._enterprise_can_use_tools_batch(account_id, tool_names)
            else:
                return await self._saas_can_use_tools_batch(account_id, tool_names)
        except Exception as e:
            logger.error(
                f"[TOOL_BILLING] Error in can_use_tools_batch for "
                f"{account_id}/{tool_names}: {e}"
            )
            # Fail-open: don't block tool execution on billing errors
            return {
                "can_use": True,
                "total_cost": 0,
                "reason": "check_error",
                "error": str(e),
            }

    # ------------------------------------------------------------------ #
    #  Post-execution deduction
    # ------------------------------------------------------------------ #

    async def deduct_tool(
        self,
        account_id: str,
        tool_name: str,
        thread_id: Optional[str] = None,
        message_id: Optional[str] = None,
    ) -> Dict:
        """
        Deduct credits for a successful execution of *tool_name*.

        Returns
        -------
        dict
            Always contains ``success: bool`` and ``cost: float``.
            Enterprise responses additionally include ``new_balance``
            and ``user_remaining``.
        """
        if config.ENV_MODE == EnvMode.LOCAL:
            return {"success": True, "cost": 0, "reason": "local_mode"}

        try:
            if config.ENTERPRISE_MODE:
                return await self._enterprise_deduct_tool(
                    account_id, tool_name, thread_id, message_id
                )
            else:
                return await self._saas_deduct_tool(
                    account_id, tool_name, thread_id, message_id
                )
        except Exception as e:
            logger.error(f"[TOOL_BILLING] Error in deduct_tool for {account_id}/{tool_name}: {e}")
            return {"success": False, "cost": 0, "error": str(e)}

    # ================================================================== #
    #  Enterprise implementation
    # ================================================================== #

    async def _enterprise_can_use_tool(self, account_id: str, tool_name: str) -> Dict:
        db = DBConnection()
        client = await db.client

        result = await client.rpc(
            "enterprise_can_use_tool",
            {"p_account_id": account_id, "p_tool_name": tool_name},
        ).execute()

        if not result.data:
            logger.error(f"[TOOL_BILLING] Empty response from enterprise_can_use_tool for {account_id}/{tool_name}")
            return {"can_use": True, "required_cost": 0, "reason": "empty_response"}

        # The RPC returns a single-row table
        row = result.data[0] if isinstance(result.data, list) else result.data
        return {
            "can_use": bool(row.get("can_use", True)),
            "required_cost": float(row.get("required_cost", 0)),
            "current_balance": float(row.get("current_balance", 0)),
            "user_remaining": float(row.get("user_remaining", 0)),
        }

    async def _enterprise_can_use_tools_batch(
        self, account_id: str, tool_names: List[str]
    ) -> Dict:
        db = DBConnection()
        client = await db.client

        result = await client.rpc(
            "enterprise_can_use_tools_batch",
            {"p_account_id": account_id, "p_tool_names": tool_names},
        ).execute()

        if not result.data:
            logger.error(
                f"[TOOL_BILLING] Empty response from enterprise_can_use_tools_batch "
                f"for {account_id}/{tool_names}"
            )
            return {"can_use": True, "total_cost": 0, "reason": "empty_response"}

        row = result.data[0] if isinstance(result.data, list) else result.data
        return {
            "can_use": bool(row.get("can_use", True)),
            "total_cost": float(row.get("total_cost", 0)),
            "current_balance": float(row.get("current_balance", 0)),
            "user_remaining": float(row.get("user_remaining", 0)),
        }

    async def _enterprise_deduct_tool(
        self,
        account_id: str,
        tool_name: str,
        thread_id: Optional[str],
        message_id: Optional[str],
    ) -> Dict:
        db = DBConnection()
        client = await db.client

        result = await client.rpc(
            "enterprise_use_tool_credits",
            {
                "p_account_id": account_id,
                "p_tool_name": tool_name,
                "p_thread_id": thread_id,
                "p_message_id": message_id,
            },
        ).execute()

        if not result.data:
            logger.error(f"[TOOL_BILLING] Empty response from enterprise_use_tool_credits for {account_id}/{tool_name}")
            return {"success": False, "cost": 0, "error": "empty_response"}

        row = result.data[0] if isinstance(result.data, list) else result.data
        success = bool(row.get("success", False))
        cost = float(row.get("cost_charged", 0))

        if success:
            logger.info(
                f"[TOOL_BILLING] Enterprise deducted ${cost:.4f} for tool '{tool_name}' "
                f"(user={account_id}, balance=${row.get('new_balance', 0):.2f})"
            )
        else:
            logger.warning(
                f"[TOOL_BILLING] Enterprise deduction failed for tool '{tool_name}' "
                f"(user={account_id})"
            )

        return {
            "success": success,
            "cost": cost,
            "new_balance": float(row.get("new_balance", 0)),
            "user_remaining": float(row.get("user_remaining", 0)),
        }

    # ================================================================== #
    #  SaaS implementation
    # ================================================================== #

    async def _saas_can_use_tool(self, account_id: str, tool_name: str) -> Dict:
        """
        SaaS pre-check: look up the tool cost from the ``tool_costs`` table
        and compare against the user's credit balance.
        """
        cost = await self._get_tool_cost(tool_name)

        # Free tools always pass
        if cost <= 0:
            return {"can_use": True, "required_cost": 0}

        balance_info = await credit_manager.get_balance(account_id)
        if isinstance(balance_info, dict):
            balance = Decimal(str(balance_info.get("total", 0)))
        else:
            balance = Decimal(str(balance_info or 0))

        can_use = balance >= cost
        return {
            "can_use": can_use,
            "required_cost": float(cost),
            "current_balance": float(balance),
        }

    async def _saas_deduct_tool(
        self,
        account_id: str,
        tool_name: str,
        thread_id: Optional[str],
        message_id: Optional[str],
    ) -> Dict:
        """
        SaaS deduction: look up cost, deduct via ``credit_manager``.
        """
        cost = await self._get_tool_cost(tool_name)

        if cost <= 0:
            return {"success": True, "cost": 0, "reason": "free_tool"}

        result = await credit_manager.deduct_credits(
            account_id=account_id,
            amount=cost,
            description=f"Tool usage: {tool_name}",
            type="tool_usage",
            message_id=message_id,
            thread_id=thread_id,
        )

        success = result.get("success", False)

        if success:
            logger.info(
                f"[TOOL_BILLING] SaaS deducted ${cost:.4f} for tool '{tool_name}' "
                f"(user={account_id})"
            )
            await invalidate_account_state_cache(account_id)
        else:
            logger.warning(
                f"[TOOL_BILLING] SaaS deduction failed for tool '{tool_name}' "
                f"(user={account_id}): {result.get('error')}"
            )

        return {
            "success": success,
            "cost": float(cost),
            "new_balance": result.get("new_total", result.get("new_balance", 0)),
            "transaction_id": result.get("transaction_id", result.get("ledger_id")),
        }

    async def _saas_can_use_tools_batch(
        self, account_id: str, tool_names: List[str]
    ) -> Dict:
        """
        SaaS batch pre-check: look up costs for all *tool_names* in one
        query, sum them, and compare against the user's credit balance.
        """
        costs = await self._get_tool_costs_batch(tool_names)
        total = sum(costs.values())

        # All free -> pass immediately
        if total <= 0:
            return {"can_use": True, "total_cost": 0}

        balance_info = await credit_manager.get_balance(account_id)
        if isinstance(balance_info, dict):
            balance = Decimal(str(balance_info.get("total", 0)))
        else:
            balance = Decimal(str(balance_info or 0))

        can_use = balance >= total
        return {
            "can_use": can_use,
            "total_cost": float(total),
            "current_balance": float(balance),
        }

    # ================================================================== #
    #  Cost lookup (for agent awareness)
    # ================================================================== #

    async def get_tool_costs(self, tool_names: List[str]) -> Dict[str, float]:
        """
        Look up per-invocation costs for *tool_names*. Used to inject cost
        into tool descriptions so agents see them when choosing tools.
        """
        if not tool_names:
            return {}
        costs = await self._get_tool_costs_batch(tool_names)
        return {name: float(c) for name, c in costs.items() if c > 0}

    # ================================================================== #
    #  Helpers
    # ================================================================== #

    @staticmethod
    async def _get_tool_costs_batch(tool_names: List[str]) -> Dict[str, Decimal]:
        """
        Look up per-invocation costs for all *tool_names* in a single
        query.  Returns a dict mapping each tool name to its cost
        (``Decimal('0')`` for tools not found or inactive).
        """
        # Initialise every requested tool to zero so callers always get a
        # complete mapping even when the tool isn't in the table.
        result_map: Dict[str, Decimal] = {name: Decimal("0") for name in tool_names}

        try:
            db = DBConnection()
            client = await db.client
            result = (
                await client.table("tool_costs")
                .select("tool_name, cost")
                .in_("tool_name", tool_names)
                .eq("is_active", True)
                .execute()
            )
            if result.data:
                for row in result.data:
                    result_map[row["tool_name"]] = Decimal(str(row["cost"]))
        except Exception as e:
            logger.error(
                f"[TOOL_BILLING] Failed to batch-look-up costs for "
                f"tools {tool_names}: {e}"
            )

        return result_map

    @staticmethod
    async def _get_tool_cost(tool_name: str) -> Decimal:
        """
        Look up the per-invocation cost for *tool_name* from the
        ``tool_costs`` table.  Returns ``Decimal('0')`` when the tool
        is not found or is inactive.
        """
        try:
            db = DBConnection()
            client = await db.client
            result = (
                await client.table("tool_costs")
                .select("cost")
                .eq("tool_name", tool_name)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
            if result.data:
                return Decimal(str(result.data[0]["cost"]))
        except Exception as e:
            logger.error(f"[TOOL_BILLING] Failed to look up cost for tool '{tool_name}': {e}")

        return Decimal("0")


# Singleton -- import this wherever tool billing is needed.
tool_billing_service = ToolBillingService()
