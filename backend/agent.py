"""Gemini-powered decision briefs for Sentinel's anticipatory-action workflow."""

from __future__ import annotations

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from .confidence import calculate_trigger_confidence
from .priority import allowed_priorities_for_status, constrain_priority


TRIGGER_THRESHOLD = 15.2
SYSTEM_PROMPT = """You are SENTINEL, an expert Anticipatory Action Decision Engine
specialized in East African climate hazards (ASAL region, Karamoja).
Your job is to translate drought probability triggers into role-specific operational briefs.
DO NOT give generic climate summaries. Give concrete, role-tailored actions with explicit
confidence scores and conditionality. Use actions appropriate to ASAL standard operating
procedures and avoid claiming that an action has already been executed."""


class ActionBrief(BaseModel):
    role: str = Field(
        description="Ex: County Drought Coordinator, Water Committee, Community Health Officer"
    )
    priority: str = Field(description="CRITICAL, HIGH, MEDIUM, LOW")
    recommended_action: str = Field(
        description="Concrete operational step based on ASAL Standard Operating Procedures"
    )
    confidence_score: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence value between 0.0 and 1.0 regarding trigger necessity",
    )
    confidence_rationale: str = Field(
        description="Why this action is needed and what field observation would alter this decision"
    )
    key_bottlenecks: List[str] = Field(description="Key operational or resource risks")


class DistrictBriefResponse(BaseModel):
    district_name: str
    drought_probability: float
    trigger_status: str
    briefs: List[ActionBrief]


class GeminiConfigurationError(RuntimeError):
    """Raised when the Gemini service is not configured."""


class GeminiGenerationError(RuntimeError):
    """Raised when Gemini cannot return a valid structured brief."""


def _get_client() -> genai.Client:
    load_dotenv(Path(__file__).with_name(".env"))
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiConfigurationError("GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=api_key)


def generate_decision_briefs(
    district_name: str, drought_prob: float, roles: List[str]
) -> DistrictBriefResponse:
    """Generate native-schema Gemini briefs from a live ICPAC district probability."""
    trigger_status = "ACTIVATED" if drought_prob >= TRIGGER_THRESHOLD else "WATCH"
    computed_confidence = calculate_trigger_confidence(drought_prob, TRIGGER_THRESHOLD)
    allowed_priorities = ", ".join(sorted(allowed_priorities_for_status(trigger_status)))
    requested_roles = ", ".join(roles)
    user_prompt = f"""Generate exactly one decision brief for each requested role.

District: {district_name}
Drought probability: {drought_prob:.1f}%
Official trigger threshold: {TRIGGER_THRESHOLD:.1f}%
Trigger status: {trigger_status}
Precomputed trigger confidence: {computed_confidence:.2f}
Allowed priority values for this trigger status: {allowed_priorities}
Requested roles: {requested_roles}

IMPORTANT: The trigger confidence value above is already computed deterministically
from the statistical margin between the forecast probability and the activation
threshold. You MUST use this exact value ({computed_confidence:.2f}) as
confidence_score in your response for every role. Do not recalculate, adjust,
or invent a different confidence value. Your role is only to explain WHY this
confidence level makes sense given the data, in the rationale field.

IMPORTANT: Priority is constrained by the trigger status. For this {trigger_status}
district, you MUST use only one of: {allowed_priorities}. Do not use any other
priority value. In particular, WATCH districts must never receive HIGH or CRITICAL,
and ACTIVATED districts must never receive MEDIUM or LOW.

For ACTIVATED, specify time-bound anticipatory actions. For WATCH, specify proportionate
preparedness and field validation actions. State what observation could change the decision.
Return only the structured response matching the provided schema."""

    try:
        # Keep the SDK client alive for the complete request. Calling through a
        # temporary client can close its underlying HTTP connection too early.
        client = _get_client()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=DistrictBriefResponse,
            ),
        )
        if response.parsed is not None:
            result = DistrictBriefResponse.model_validate(response.parsed)
        elif response.text:
            result = DistrictBriefResponse.model_validate_json(response.text)
        else:
            raise GeminiGenerationError("Gemini returned no structured decision brief.")

        for brief in result.briefs:
            # Normalize tolerated floating-point variance to the exact deterministic value.
            brief.confidence_score = computed_confidence
            brief.priority = constrain_priority(brief.priority, trigger_status)
        return result
    except GeminiConfigurationError:
        raise
    except Exception as exc:
        raise GeminiGenerationError("Gemini failed to generate a valid decision brief.") from exc
