#!/usr/bin/env python3
"""
Normalize a token deployment request for autonomous-agent use.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


def load_input(input_path: str) -> dict[str, Any]:
    if input_path == "-":
        raw = sys.stdin.read()
    else:
        raw = Path(input_path).read_text()

    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("input JSON must be an object")
    return data


def read_bool(data: dict[str, Any], key: str, default: bool = False) -> bool:
    value = data.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y"}:
            return True
        if normalized in {"0", "false", "no", "n"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def require_address(value: Any, field_name: str, blocking_issues: list[str]) -> str:
    if not isinstance(value, str) or not ADDRESS_RE.match(value):
        blocking_issues.append(f"{field_name} must be a 20-byte EVM address")
        return "0x0000000000000000000000000000000000000000"
    return value


def pascal_case(name: str) -> str:
    words = re.findall(r"[A-Za-z0-9]+", name)
    if not words:
        return "Token"
    return "".join(word[:1].upper() + word[1:] for word in words)


def normalize_standard(raw: Any, blocking_issues: list[str]) -> str:
    if not isinstance(raw, str):
        blocking_issues.append("standard must be erc20 or erc721")
        return "erc20"
    standard = raw.strip().lower()
    if standard not in {"erc20", "erc721"}:
        blocking_issues.append("standard must be erc20 or erc721")
        return "erc20"
    return standard


def normalize_decimals(raw: Any, warnings: list[str], blocking_issues: list[str]) -> int:
    if raw is None:
        return 18
    try:
        value = int(raw)
    except (TypeError, ValueError):
        blocking_issues.append("decimals must be an integer between 0 and 255")
        return 18
    if value < 0 or value > 255:
        blocking_issues.append("decimals must be an integer between 0 and 255")
        return 18
    if value != 18:
        warnings.append("non-18 decimals are more error-prone for Ajna and Uniswap operators")
    return value


def normalize_uint_string(
    raw: Any, field_name: str, blocking_issues: list[str], *, required: bool = False
) -> str | None:
    if raw is None:
        if required:
            blocking_issues.append(f"{field_name} is required")
        return None

    try:
        value = int(raw)
    except (TypeError, ValueError):
        blocking_issues.append(f"{field_name} must be a non-negative integer")
        return None

    if value < 0:
        blocking_issues.append(f"{field_name} must be a non-negative integer")
        return None

    return str(value)


def build_erc20_result(data: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []
    blocking_issues: list[str] = []

    name = data.get("name")
    symbol = data.get("symbol")
    if not isinstance(name, str) or not name.strip():
        blocking_issues.append("name is required")
        name = "Token"
    if not isinstance(symbol, str) or not symbol.strip():
        blocking_issues.append("symbol is required")
        symbol = "TOKEN"

    owner = require_address(data.get("owner"), "owner", blocking_issues)
    initial_recipient = require_address(
        data.get("initialRecipient"), "initialRecipient", blocking_issues
    )

    initial_supply = normalize_uint_string(
        data.get("initialSupply"), "initialSupply", blocking_issues, required=True
    )

    decimals = normalize_decimals(data.get("decimals"), warnings, blocking_issues)
    minting_enabled = read_bool(data, "mintable")
    permit = read_bool(data, "permit")

    flags = {
        "feeOnTransfer": read_bool(data, "feeOnTransfer"),
        "rebasing": read_bool(data, "rebasing"),
        "blacklist": read_bool(data, "blacklist"),
        "pausable": read_bool(data, "pausable"),
        "transferHooks": read_bool(data, "transferHooks"),
        "upgradeable": read_bool(data, "upgradeable"),
    }

    for flag_name in ("feeOnTransfer", "rebasing", "blacklist", "pausable", "transferHooks"):
        if flags[flag_name]:
            blocking_issues.append(
                f"{flag_name} breaks the boring ERC20 semantics expected by Ajna or Uniswap"
            )

    if flags["upgradeable"]:
        warnings.append("upgradeable ERC20s add operational risk and should be explicit in handoff")
    if minting_enabled:
        warnings.append("owner minting changes supply assumptions and must be disclosed")
    if permit:
        warnings.append("permit requested: extend the template with ERC20Permit only if downstream UX needs it")

    status = "blocked" if blocking_issues else "compatible"
    notes = ["generic ERC20 path for Ajna and Uniswap"] if not blocking_issues else []

    return {
        "standard": "erc20",
        "name": name,
        "symbol": symbol,
        "contractName": pascal_case(str(name)),
        "owner": owner,
        "initialRecipient": initial_recipient,
        "initialSupply": initial_supply,
        "decimals": decimals,
        "features": {
            "mintable": minting_enabled,
            "permit": permit,
            **flags,
        },
        "template": {
            "project": "assets/foundry-template",
            "contract": "src/DefiCompatibleERC20.sol",
            "deployScript": "script/DeployDefiCompatibleERC20.s.sol",
            "test": "test/DefiCompatibleERC20.t.sol",
        },
        "compatibility": {
            "ajna": {"status": status, "notes": notes},
            "uniswap": {"status": status, "notes": notes},
        },
        "requiredEnv": [
            "PRIVATE_KEY",
            "RPC_URL",
            "ERC20_NAME",
            "ERC20_SYMBOL",
            "ERC20_DECIMALS",
            "INITIAL_OWNER",
            "INITIAL_RECIPIENT",
            "INITIAL_SUPPLY",
            "ERC20_MINTING_ENABLED",
        ],
        "blockingIssues": blocking_issues,
        "warnings": warnings,
        "nextSteps": [
            "copy assets/foundry-template into the target repo",
            "run forge build and forge test before broadcast",
            "broadcast the matching deploy script with explicit env vars",
            "verify source and write a deployment manifest",
        ],
    }


def build_erc721_result(data: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []
    blocking_issues: list[str] = []

    name = data.get("name")
    symbol = data.get("symbol")
    if not isinstance(name, str) or not name.strip():
        blocking_issues.append("name is required")
        name = "Collection"
    if not isinstance(symbol, str) or not symbol.strip():
        blocking_issues.append("symbol is required")
        symbol = "NFT"

    owner = require_address(data.get("owner"), "owner", blocking_issues)
    base_uri = data.get("baseURI", "")
    if base_uri == "":
        warnings.append("baseURI is empty: metadata may not resolve immediately after deployment")
    elif not isinstance(base_uri, str):
        blocking_issues.append("baseURI must be a string")
        base_uri = ""

    flags = {
        "soulbound": read_bool(data, "soulbound"),
        "blacklist": read_bool(data, "blacklist"),
        "transferHooks": read_bool(data, "transferHooks"),
        "upgradeable": read_bool(data, "upgradeable"),
    }

    for flag_name in ("soulbound", "blacklist", "transferHooks"):
        if flags[flag_name]:
            blocking_issues.append(
                f"{flag_name} breaks the transferable ERC721 semantics expected by Ajna collateral flows"
            )

    if flags["upgradeable"]:
        warnings.append("upgradeable ERC721s add operational risk and should be explicit in handoff")

    ajna_status = "blocked" if blocking_issues else "compatible"

    return {
        "standard": "erc721",
        "name": name,
        "symbol": symbol,
        "contractName": pascal_case(str(name)),
        "owner": owner,
        "baseURI": base_uri,
        "features": flags,
        "template": {
            "project": "assets/foundry-template",
            "contract": "src/DefiCompatibleERC721.sol",
            "deployScript": "script/DeployDefiCompatibleERC721.s.sol",
            "test": "test/DefiCompatibleERC721.t.sol",
        },
        "compatibility": {
            "ajna": {
                "status": ajna_status,
                "notes": ["transferable ERC721 path for Ajna collateral or pool usage"]
                if not blocking_issues
                else [],
            },
            "uniswap": {
                "status": "clarify",
                "notes": ["generic ERC721 collections are not Uniswap pair assets"],
            },
        },
        "requiredEnv": [
            "PRIVATE_KEY",
            "RPC_URL",
            "ERC721_NAME",
            "ERC721_SYMBOL",
            "INITIAL_OWNER",
            "ERC721_BASE_URI",
        ],
        "blockingIssues": blocking_issues,
        "warnings": warnings,
        "nextSteps": [
            "copy assets/foundry-template into the target repo",
            "run forge build and forge test before broadcast",
            "broadcast the matching deploy script with explicit env vars",
            "verify source and mint plus transfer smoke test after deployment",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize a token deployment request.")
    parser.add_argument("input", help="JSON file path or - for stdin")
    parser.add_argument("--out", help="Optional output file path")
    args = parser.parse_args()

    data = load_input(args.input)
    blocking_issues: list[str] = []
    standard = normalize_standard(data.get("standard"), blocking_issues)

    result: dict[str, Any]
    if standard == "erc20":
        result = build_erc20_result(data)
    else:
        result = build_erc721_result(data)

    result["chainId"] = data.get("chainId")
    result["chainName"] = data.get("chainName")
    result["requestedBy"] = data.get("requestedBy", "autonomous-agent")
    result["normalizedAt"] = "manual-run"

    if blocking_issues:
        result.setdefault("blockingIssues", []).extend(blocking_issues)
        if standard == "erc20":
            result["compatibility"]["ajna"]["status"] = "blocked"
            result["compatibility"]["uniswap"]["status"] = "blocked"
        else:
            result["compatibility"]["ajna"]["status"] = "blocked"

    output = json.dumps(result, indent=2, sort_keys=True) + "\n"

    if args.out:
        Path(args.out).write_text(output)
    else:
        sys.stdout.write(output)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
