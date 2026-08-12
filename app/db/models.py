from sqlalchemy import Column, Float, Integer, String

from app.db.database import Base

#다시 작성 임의의 코드임
class JobPosting(Base):
    __tablename__ = "job_postings"

    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    company = Column(String)
    source = Column(String)
    url = Column(String)
    raw_text = Column(String)


class Technology(Base):
    __tablename__ = "technologies"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    category = Column(String)


class GapResult(Base):
    __tablename__ = "gap_results"

    id = Column(Integer, primary_key=True)
    job_category = Column(String, nullable=False)
    technology_id = Column(Integer, nullable=False)
    demand_score = Column(Float)
    ecosystem_score = Column(Float)
    gap_score = Column(Float)
