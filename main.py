from fastapi import (FastAPI)
from fastapi.middleware.cors import (CORSMiddleware)
from routers.file_router import router as file_router
from slowapi import (Limiter)
from slowapi.errors import (RateLimitExceeded)
from slowapi import (_rate_limit_exceeded_handler)
from slowapi.util import get_remote_address
from slowapi.middleware import (SlowAPIMiddleware)
from fastapi import Request
from config.limiter import limiter


app = FastAPI()
"""
For example, SlowAPI's middleware looks for:

request.app.state.limiter

internally, so you must store the limiter there.
"""
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def handle_rate_exceeds(request:Request, exc:RateLimitExceeded):
    return _rate_limit_exceeded_handler(request, exc)

app.include_router(file_router)
app.add_middleware(CORSMiddleware,
                   allow_headers=["*"],
                   allow_methods=["*"],
                   allow_origins=["https://suhaanshakya99-spec.github.io/AInotesMaker/", "http://127.0.0.1:8000/"])

app.add_middleware(SlowAPIMiddleware)

@app.get("/")
def root():
    return {"message":"system is running"}


@app.get("/test-limit")
@limiter.limit("2/minute")
async def test_limit(request: Request):
    return {"message": "success"}