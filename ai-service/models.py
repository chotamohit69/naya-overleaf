from pydantic import BaseModel
from typing import Optional


class FixErrorRequest(BaseModel):
    user_id: str
    error_log: str
    document_content: str
    error_line: Optional[int] = None


class FixErrorResponse(BaseModel):
    explanation: str
    patch: dict


class ChatRequest(BaseModel):
    user_id: str
    message: str
    document_content: str
    cursor_line: Optional[int] = None


class ChatResponse(BaseModel):
    insert_after_line: int
    latex: str


class CompleteRequest(BaseModel):
    user_id: str
    prefix: str
    suffix: str


class CompleteResponse(BaseModel):
    completion: str
