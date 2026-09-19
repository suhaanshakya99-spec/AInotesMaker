from fastapi import (FastAPI)
from fastapi.middleware.cors import (CORSMiddleware)
from routers.file_router import router as file_router

app = FastAPI()
app.include_router(file_router)
app.add_middleware(CORSMiddleware,
                   allow_credentials=True,
                   allow_headers=["*"],
                   allow_methods=["*"],
                   allow_origins=["*"])

@app.get("/")
def root():
    return {"message":"system is running"}