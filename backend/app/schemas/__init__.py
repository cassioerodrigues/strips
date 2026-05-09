"""
app/schemas/__init__.py — reexporta todos os schemas Pydantic do Stirps.

`from app.schemas import *` funciona sem erro.
"""

from app.schemas.auth import MeResponse, ProfileOut, TreeMembershipOut
from app.schemas.event import EventCreate, EventOut, EventType
from app.schemas.media import (
    MediaCreate,
    MediaKind,
    MediaLinkPayload,
    MediaOut,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.schemas.person import PersonCreate, PersonOut, PersonUpdate, Sex
from app.schemas.relations import (
    ParentKind,
    ParentLinkCreate,
    ParentLinkOut,
    RelationsResponse,
)
from app.schemas.tree import TreeCreate, TreeOut, TreeRole, TreeUpdate
from app.schemas.union import UnionCreate, UnionOut, UnionStatus, UnionType, UnionUpdate

__all__ = [
    # auth
    "MeResponse",
    "ProfileOut",
    "TreeMembershipOut",
    # tree
    "TreeCreate",
    "TreeUpdate",
    "TreeOut",
    "TreeRole",
    # person
    "PersonCreate",
    "PersonUpdate",
    "PersonOut",
    "Sex",
    # union
    "UnionCreate",
    "UnionUpdate",
    "UnionOut",
    "UnionType",
    "UnionStatus",
    # event
    "EventCreate",
    "EventOut",
    "EventType",
    # media
    "MediaCreate",
    "MediaOut",
    "MediaKind",
    "MediaLinkPayload",
    "UploadUrlRequest",
    "UploadUrlResponse",
    # relations
    "RelationsResponse",
    "ParentLinkCreate",
    "ParentLinkOut",
    "ParentKind",
]
