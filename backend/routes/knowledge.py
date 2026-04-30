from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as OrmSession

from database import get_db
from models import KnowledgeEdge, KnowledgeNode, User
from schemas.knowledge import EdgeOut, GraphOut, NodeOut
from services import auth_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/nodes", response_model=list[NodeOut])
def list_nodes(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[KnowledgeNode]:
    return db.query(KnowledgeNode).all()


@router.get("/edges", response_model=list[EdgeOut])
def list_edges(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> list[KnowledgeEdge]:
    return db.query(KnowledgeEdge).all()


@router.get("/graph", response_model=GraphOut)
def full_graph(
    db: OrmSession = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
) -> GraphOut:
    nodes = db.query(KnowledgeNode).all()
    edges = db.query(KnowledgeEdge).all()
    return GraphOut(
        nodes=[NodeOut.model_validate(n) for n in nodes],
        edges=[EdgeOut.model_validate(e) for e in edges],
    )
