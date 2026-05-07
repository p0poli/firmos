"""Anonymization pipeline for firm memory contributions.

Strips personal identifiers from conversation text before it enters the
shared firm knowledge pool.  The goal is to preserve the *knowledge* —
regulation references, solutions, timelines, building types — while
removing everything that could identify who said what or which specific
project it was about.

Main entry-point
----------------
anonymize_for_firm_memory(text, user, project=None, db=None) -> dict

Returned dict
-------------
{
    "anonymized_text": str,          # cleaned text, safe to store
    "auto_tags":       list[str],    # topic tags  e.g. ["regulation", "fire_safety"]
    "category":        str,          # coarse bucket: regulation|solution|process|technical|general
}

Replacement order (important — later steps see the already-replaced text)
--------------------------------------------------------------------------
1. Emails
2. Phone numbers
3. Street addresses
4. Firm project names  → generic building type ("a healthcare project")
5. Firm user names     → "a team member"
6. External person names (2-word capitalised sequences not in exclusion list)
                       → "an external contact"
7. Auto-tag + categorise
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Session as OrmSession

if TYPE_CHECKING:
    from models import Project, User

logger = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Building-type inference
# ---------------------------------------------------------------------------

_BUILDING_RULES: list[tuple[list[str], str]] = [
    (["hospital", "clinic", "medical", "healthcare", "health care", "urgent care"],
     "a healthcare project"),
    (["school", "university", "college", "education", "academic", "campus", "kindergarten"],
     "an educational project"),
    (["office", "corporate", "headquarters", "coworking", "co-working", "hq"],
     "a commercial office project"),
    (["residential", "housing", "apartment", "condo", "condominium",
      "multi-family", "multifamily", "townhouse", "townhome"],
     "a residential project"),
    (["retail", "store", "shop", "mall", "shopping center", "boutique"],
     "a retail project"),
    (["museum", "gallery", "cultural", "theatre", "theater", "library", "exhibition"],
     "a cultural project"),
    (["industrial", "warehouse", "factory", "manufacturing", "logistics", "distribution"],
     "an industrial project"),
    (["mixed-use", "mixed use"],
     "a mixed-use project"),
    (["infrastructure", "bridge", "transit", "transport", "airport", "railway", "metro"],
     "an infrastructure project"),
    (["hotel", "hospitality", "resort", "lodging", "motel"],
     "a hospitality project"),
    (["restaurant", "food service", "food hall", "cafeteria"],
     "a food service project"),
    (["laboratory", "lab ", "research facility", "r&d"],
     "a research facility project"),
    (["church", "mosque", "synagogue", "temple", "chapel", "religious", "worship"],
     "a religious project"),
    (["government", "civic", "municipal", "courthouse", "city hall", "public building"],
     "a civic project"),
    (["stadium", "arena", "gymnasium", "recreation", "sports complex"],
     "a recreational project"),
]


def _infer_building_type(name: str, description: Optional[str] = None) -> str:
    """Return a generic building-type label for a project, e.g. 'a healthcare project'."""
    combined = (name + " " + (description or "")).lower()
    for keywords, label in _BUILDING_RULES:
        if any(kw in combined for kw in keywords):
            return label
    return "a project"


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------

_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)

# Covers US (with/without country code) and most E.164 international formats.
_PHONE_RE = re.compile(
    r"(?:"
    r"\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}"       # US/Canada
    r"|\+\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{2,4}[\s.\-]?\d{2,4}"  # international
    r")"
)

# Street-level address: "42 Elm Street, Portland, OR 97201"
_ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*"
    r"\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|"
    r"Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Ter|Circle|Cir|"
    r"Highway|Hwy|Parkway|Pkwy|Square|Sq)\.?"
    r"(?:\s*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?"   # optional city
    r"(?:\s*,\s*[A-Z]{2})?"                           # optional state abbrev
    r"(?:\s+\d{5}(?:-\d{4})?)?",                      # optional ZIP
    re.IGNORECASE,
)

# Two consecutive capitalized words — catches "John Smith", "Sarah Connor" etc.
_EXTERNAL_NAME_RE = re.compile(r"\b([A-Z][a-z]{1,19})\s+([A-Z][a-z]{1,24})\b")

# Words that begin with a capital only because they are technical terms,
# sentence-starters, calendar words, directions, or architectural jargon.
# If either word in a bi-gram matches this set it is NOT treated as a person name.
_NON_NAME_WORDS: frozenset[str] = frozenset(
    {
        # Calendar
        "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
        "January", "February", "March", "April", "May", "June", "July", "August",
        "September", "October", "November", "December",
        # Compass / geography
        "North", "South", "East", "West", "Northeast", "Northwest", "Southeast",
        "Southwest", "Central", "Greater", "Upper", "Lower",
        # Architecture / construction nouns
        "Building", "Project", "Site", "Phase", "Floor", "Level", "Zone",
        "Area", "Space", "Block", "Unit", "Suite", "Section", "Bay",
        "Facade", "Roof", "Basement", "Lobby", "Core", "Shaft", "Atrium",
        # Roles / titles
        "Project", "Manager", "Engineer", "Director", "Architect", "Principal",
        "Consultant", "Contractor", "Developer", "Owner", "Client", "Admin",
        "Team", "Member", "Contact", "External", "Firm",
        # Regulation / standards
        "Code", "Standard", "Regulation", "Requirement", "Clause", "Article",
        "Section", "Appendix", "Table", "Figure", "Schedule",
        # Common words that start sentences
        "The", "This", "That", "These", "Those", "There",
        "We", "Our", "Their", "Its", "My", "Your",
        "Please", "Thank", "Sorry", "Note", "Also", "However", "Therefore",
        "Additionally", "Furthermore", "Currently", "Previously", "Finally",
        # Already-inserted replacement tokens
        "Team", "External",
    }
)


def _looks_like_person_name(first: str, last: str) -> bool:
    """Return True if (first, last) is plausibly an external person name."""
    if first in _NON_NAME_WORDS or last in _NON_NAME_WORDS:
        return False
    # Guard against very short words that are likely abbreviations or initials
    if len(first) < 2 or len(last) < 2:
        return False
    return True


# ---------------------------------------------------------------------------
# Auto-tagging
# ---------------------------------------------------------------------------

_TAG_RULES: list[tuple[str, list[str]]] = [
    ("regulation", [
        "regulation", "building code", "fire code", "code section",
        "standard", "requirement", "compliance", "permit", "ordinance",
        "bylaw", "ibc", "nfpa", "ada", "nec", "ubc", "ashrae", "leed",
        "local authority", "zoning code", "approved document",
    ]),
    ("fire_safety", [
        "fire", "egress", "exit route", "exit door", "sprinkler",
        "smoke", "evacuation", "stairwell", "fire-rated", "fire rated",
        "firewall", "suppression", "detector", "alarm", "occupancy load",
        "means of egress", "travel distance",
    ]),
    ("zoning", [
        "zoning", "floor area ratio", " far ", "setback", "variance",
        "land use", "planning permission", "planning department",
        "municipality", "city council", "easement", "right-of-way",
        "density", "height limit", "envelope",
    ]),
    ("structural", [
        "structural", "load bearing", "load-bearing", "beam", "column",
        "foundation", "seismic", "wind load", "steel frame", "concrete",
        "rebar", "masonry", "shear wall", "lateral force", "dead load",
        "live load", "deflection", "moment",
    ]),
    ("stakeholder", [
        "client", "stakeholder", "owner", "developer", "contractor",
        "subcontractor", "consultant", "investor", "board approval",
        "sign-off", "presentation", "review meeting",
    ]),
    ("scheduling", [
        "deadline", "timeline", "schedule", "delay", "milestone",
        "completion date", " days", " weeks", " months", "phasing",
        "handover", "substantial completion", "punch list", "programme",
    ]),
]


def _extract_tags(text: str) -> list[str]:
    lower = text.lower()
    return [tag for tag, keywords in _TAG_RULES if any(kw in lower for kw in keywords)]


def _classify_category(tags: list[str], text: str) -> str:
    """Map tag set to a single coarse category."""
    if "regulation" in tags or "zoning" in tags or "fire_safety" in tags:
        return "regulation"
    if "structural" in tags:
        return "technical"
    if "scheduling" in tags or "stakeholder" in tags:
        return "process"
    lower = text.lower()
    solution_markers = [
        "solution", "resolved", "workaround", "approach", "method",
        "fixed by", "we decided", "we used", "we opted",
    ]
    if any(m in lower for m in solution_markers):
        return "solution"
    return "general"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _replace_phrase(text: str, phrase: str, replacement: str) -> str:
    """Case-insensitive whole-word substitution of `phrase` → `replacement`."""
    if not phrase or len(phrase.strip()) < 2:
        return text
    pattern = re.compile(r"\b" + re.escape(phrase.strip()) + r"\b", re.IGNORECASE)
    return pattern.sub(replacement, text)


# ---------------------------------------------------------------------------
# Main entry-point
# ---------------------------------------------------------------------------


def anonymize_for_firm_memory(
    text: str,
    user: "User",
    project: Optional["Project"] = None,
    db: Optional[OrmSession] = None,
) -> dict:
    """Strip PII from `text` and classify it for the firm memory pool.

    Parameters
    ----------
    text:     Raw message content from the conversation.
    user:     The contributing user (needed to resolve firm context).
    project:  Project the message was scoped to, if any.
    db:       Live ORM session; when provided, all firm users and projects
              are fetched for more thorough name replacement.

    Returns
    -------
    {
        "anonymized_text": str,
        "auto_tags": list[str],
        "category": str,
    }
    """
    result = text

    # --- 1. Emails -----------------------------------------------------------
    result = _EMAIL_RE.sub("[email removed]", result)

    # --- 2. Phone numbers ----------------------------------------------------
    result = _PHONE_RE.sub("[phone removed]", result)

    # --- 3. Street addresses -------------------------------------------------
    result = _ADDRESS_RE.sub("[address removed]", result)

    # --- 4. Project names → building type ------------------------------------
    projects_to_replace: list["Project"] = []
    if db is not None:
        from models import Project as _ProjectModel  # noqa: PLC0415 (avoid circular at module level)
        projects_to_replace = (
            db.query(_ProjectModel)
            .filter(_ProjectModel.firm_id == user.firm_id)
            .all()
        )
    elif project is not None:
        projects_to_replace = [project]

    # Longest names first to avoid partial-match shadowing.
    projects_to_replace.sort(key=lambda p: len(p.name), reverse=True)
    for p in projects_to_replace:
        label = _infer_building_type(p.name, p.description)
        result = _replace_phrase(result, p.name, label)

    # --- 5. Firm user names → "a team member" --------------------------------
    firm_names: list[str] = []
    if db is not None:
        from models import User as _UserModel  # noqa: PLC0415
        firm_users = (
            db.query(_UserModel)
            .filter(_UserModel.firm_id == user.firm_id)
            .all()
        )
        firm_names = [u.name for u in firm_users if u.name]
    else:
        if user.name:
            firm_names = [user.name]

    # Replace longest names first (avoids "John" clobbering "John Smith").
    firm_names.sort(key=len, reverse=True)
    # Track lowercased versions so step 6 can skip them.
    replaced_names_lower: set[str] = {n.lower() for n in firm_names}
    for name in firm_names:
        result = _replace_phrase(result, name, "a team member")

    # --- 6. External proper-noun names → "an external contact" ---------------
    def _check_external(m: re.Match) -> str:
        first, last = m.group(1), m.group(2)
        full_lower = (first + " " + last).lower()
        # Skip if we already replaced this as a firm user name
        if full_lower in replaced_names_lower or first.lower() in replaced_names_lower:
            return m.group(0)
        if not _looks_like_person_name(first, last):
            return m.group(0)
        return "an external contact"

    result = _EXTERNAL_NAME_RE.sub(_check_external, result)

    # --- 7. Auto-tag and categorise ------------------------------------------
    tags = _extract_tags(result)
    category = _classify_category(tags, result)

    return {
        "anonymized_text": result,
        "auto_tags": tags,
        "category": category,
    }
