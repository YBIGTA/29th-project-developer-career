from fastapi import FastAPI

from app.api.routes import router

app = FastAPI(title="DevCompass API")

app.include_router(router)


@app.get("/")
def health_check():
    return {"status": "ok"}
