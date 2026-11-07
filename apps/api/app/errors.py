"""Error envelope (prompt-v1 §9): {code, message, fields?, retry_after?}."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        fields: dict[str, str] | None = None,
        retry_after: int | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.retry_after = retry_after

    def body(self) -> dict:
        out: dict = {"code": self.code, "message": self.message}
        if self.fields:
            out["fields"] = self.fields
        if self.retry_after is not None:
            out["retry_after"] = self.retry_after
        return out


def not_found(code: str = "not_found", message: str = "Not found") -> AppError:
    return AppError(404, code, message)


def bad_request(code: str, message: str, fields: dict[str, str] | None = None) -> AppError:
    return AppError(400, code, message, fields=fields)


def forbidden(code: str = "auth.forbidden", message: str = "Not allowed") -> AppError:
    return AppError(403, code, message)


def guest_restricted() -> AppError:
    return AppError(403, "auth.guest_restricted", "Create a free account to do this")


def unauthorized(message: str = "Sign in first") -> AppError:
    return AppError(401, "auth.required", message)


def conflict(code: str, message: str) -> AppError:
    return AppError(409, code, message)


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after is not None else None
        return JSONResponse(exc.body(), status_code=exc.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields: dict[str, str] = {}
        for e in exc.errors():
            loc = [str(p) for p in e.get("loc", []) if p not in ("body", "query", "path")]
            fields[".".join(loc) or "request"] = e.get("msg", "invalid")
        return JSONResponse(
            {"code": "validation.invalid", "message": "Some fields are invalid", "fields": fields}, status_code=422
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed", 401: "auth.required"}.get(
            exc.status_code, f"http_{exc.status_code}"
        )
        return JSONResponse({"code": code, "message": str(exc.detail)}, status_code=exc.status_code)
