from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router

app = FastAPI(title="DevCompass API")

# Vercel 프리뷰 배포마다 URL이 바뀌므로(예: devcompasstest-<hash>-cwyoon9718-5656s-projects.vercel.app),
# 이 팀 소유 프로젝트 도메인은 정규식으로 통째로 허용한다. 로컬 프론트 개발 서버도 함께 허용.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*-cwyoon9718-5656s-projects\.vercel\.app",
    allow_origins=["http://localhost:3000", "https://devcompass-nine.vercel.app"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def health_check():
    return {"status": "ok"}
