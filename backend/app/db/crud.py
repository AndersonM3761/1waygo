from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert
from app.db import models
import json
import uuid

def get_or_create_user(db: Session, profile: dict) -> models.User:
    email = profile.get("email", "anonymous@test.com")
    user = db.query(models.User).filter(models.User.email == email).first()
    
    if not user:
        user = models.User(
            id=str(uuid.uuid4()),
            email=email,
            branch=profile.get("branch"),
            year=profile.get("year"),
            interests=json.dumps(profile.get("interests", [])),
            goal=profile.get("goal")
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

def upsert_opportunity(db: Session, opp_data: dict) -> models.Opportunity:
    # Basic SQLite upsert pattern
    stmt = insert(models.Opportunity).values(
        id=str(uuid.uuid4()),
        name=opp_data["name"],
        type=opp_data["type"].lower() if opp_data["type"].lower() in [e.value for e in models.OpportunityType] else "other",
        url=opp_data["link"],
        deadline=opp_data.get("deadline", ""),
        deadline_status="confirmed",
        verified_live=True
    )
    
    # On conflict (URL exists), just return the existing record without doing anything
    stmt = stmt.on_conflict_do_nothing(index_elements=['url'])
    db.execute(stmt)
    db.commit()
    
    # Retrieve it (whether just inserted or pre-existing)
    return db.query(models.Opportunity).filter(models.Opportunity.url == opp_data["link"]).first()

def link_user_opportunity(db: Session, user_id: str, opp_id: str, why_relevant: str):
    # Check if link exists
    link = db.query(models.UserOpportunity).filter(
        models.UserOpportunity.user_id == user_id,
        models.UserOpportunity.opportunity_id == opp_id
    ).first()
    
    if not link:
        link = models.UserOpportunity(
            id=str(uuid.uuid4()),
            user_id=user_id,
            opportunity_id=opp_id,
            why_relevant=why_relevant
        )
        db.add(link)
        db.commit()

def update_user_opportunity_status(db: Session, email: str, url: str, status: str) -> bool:
    user = db.query(models.User).filter(models.User.email == email).first()
    opp = db.query(models.Opportunity).filter(models.Opportunity.url == url).first()
    
    if not user or not opp:
        return False
        
    link = db.query(models.UserOpportunity).filter(
        models.UserOpportunity.user_id == user.id,
        models.UserOpportunity.opportunity_id == opp.id
    ).first()
    
    if link:
        link.status = status
        db.commit()
        return True
    return False

def get_user_opportunities(db: Session, email: str):
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        return []
        
    links = db.query(models.UserOpportunity).filter(
        models.UserOpportunity.user_id == user.id,
        models.UserOpportunity.status.in_(["saved", "applied"])
    ).all()
    
    results = []
    for link in links:
        opp = db.query(models.Opportunity).filter(models.Opportunity.id == link.opportunity_id).first()
        if opp:
            results.append({
                "name": opp.name,
                "type": opp.type.value if hasattr(opp.type, 'value') else opp.type,
                "deadline": opp.deadline,
                "link": opp.url,
                "description": "", # Minimal info needed for saved card
                "time_commitment": "",
                "reason": link.why_relevant,
                "status": link.status
            })
    return results
