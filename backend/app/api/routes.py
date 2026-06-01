from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models.schemas import SearchRequest, OpportunityList
from app.agent.search_agent import process_profile
from app.cache.semantic_cache import check_cache, store_in_cache
from app.db.database import get_db
from app.db import crud
from app.api.dependencies import check_rate_limit

router = APIRouter()

@router.post("/search", response_model=OpportunityList, dependencies=[Depends(check_rate_limit)])
async def search(request: SearchRequest, db: Session = Depends(get_db)):
    profile_dict = request.model_dump()
    
    # 1. Check Cache
    cached_result = check_cache(profile_dict)
    if cached_result:
        # Save cached results to the new DB for this user session
        user = crud.get_or_create_user(db, profile_dict)
        for opp in cached_result.opportunities:
            db_opp = crud.upsert_opportunity(db, opp.model_dump())
            crud.link_user_opportunity(db, user.id, db_opp.id, opp.reason)
        return cached_result
        
    # 2. Process via AI Agent Pipeline
    result = await process_profile(profile_dict)
    
    # 3. Store in DB (Persistence)
    if len(result.opportunities) > 0:
        user = crud.get_or_create_user(db, profile_dict)
        for opp in result.opportunities:
            db_opp = crud.upsert_opportunity(db, opp.model_dump())
            crud.link_user_opportunity(db, user.id, db_opp.id, opp.reason)
            
        # Also store in semantic cache
        store_in_cache(profile_dict, result)
    
    return result

from app.models.schemas import SaveOpportunityRequest
from fastapi import HTTPException

@router.post("/save-opportunity")
def save_opportunity(request: SaveOpportunityRequest, db: Session = Depends(get_db)):
    success = crud.update_user_opportunity_status(db, request.email, request.url, request.status)
    if not success:
        raise HTTPException(status_code=404, detail="User or opportunity not found")
    return {"status": "success"}

@router.get("/saved-opportunities")
def get_saved_opportunities(email: str, db: Session = Depends(get_db)):
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    opps = crud.get_user_opportunities(db, email)
    return opps
