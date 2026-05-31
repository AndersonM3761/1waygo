from pydantic import BaseModel
from typing import List

class Opportunity(BaseModel):
    name: str
    type: str  # Hackathon, Certification, Competition, Internship
    deadline: str
    link: str
    description: str  # Short summary of the opportunity
    time_commitment: str
    reason: str  # "Why this is for you"

class OpportunityList(BaseModel):
    queries_used: List[str] = []
    opportunities: List[Opportunity]

class SearchRequest(BaseModel):
    email: str = "anonymous@test.com"
    branch: str
    year: str
    interests: List[str]
    goal: str

class SearchStrategy(BaseModel):
    queries: List[str]
