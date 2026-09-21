from slowapi import Limiter
from slowapi.util import get_remote_address

"""
# Rate Limiting Workflow:
# 1. Client sends a request.
# 2. SlowAPIMiddleware intercepts the request.
# 3. Middleware gets the limiter from app.state.limiter.
# 4. Limiter calls get_remote_address(request) to get the client's IP.
# 5. SlowAPI checks how many requests that IP has made.
# 6. If the limit is exceeded, RateLimitExceeded is raised.
# 7. The exception handler returns a 429 Too Many Requests response.
# 8. If within the limit, FastAPI executes the route function normally.
"""

limiter = Limiter(key_func=get_remote_address)