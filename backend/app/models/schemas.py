from pydantic import BaseModel
from typing import List, Optional

class Opportunity(BaseModel):
    name: str
    type: str  # Hackathon, Certification, Competition, Internship
    deadline: str
    link: str
    description: str  # Detailed summary of the opportunity
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
    mode: str = "Any"           # Remote / On-site / Hybrid / Any
    duration: str = "Any"       # Summer (1-2 months) / Part-time / Any
    location: str = ""          # City name
    budget: str = "Free only"   # Free only / Paid ok
    categories: List[str] = ["Hackathon", "Internship", "Certification", "Competition"]

class SearchStrategy(BaseModel):
    queries: List[str]
