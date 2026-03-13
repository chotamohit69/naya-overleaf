from fastapi import APIRouter, HTTPException
from models import ChatRequest, ChatResponse
from utils.key_resolver import resolve_user_key
from utils.prompts import CHAT_INSERT_PROMPT, SYSTEM_PROMPTS
from utils.llm_client import call_llm
import json
import re

router = APIRouter()


def parse_llm_json_response(response_text: str) -> dict:
    """Parse JSON from LLM response, handling potential markdown code blocks."""
    text = response_text.strip()
    
    if text.startswith("```"):
        lines = text.split('\n')
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = '\n'.join(lines).strip()
    
    json_match = re.search(r'\{[\s\S]*\}', text)
    if json_match:
        text = json_match.group(0)
    
    return json.loads(text)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Generate LaTeX content based on user's natural language request."""
    try:
        provider, api_key = await resolve_user_key(request.user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    cursor_line = request.cursor_line if request.cursor_line is not None else 1
    
    prompt = CHAT_INSERT_PROMPT.format(
        document_content=request.document_content[:15000],
        message=request.message,
        cursor_line=cursor_line
    )
    
    try:
        response = await call_llm(
            provider=provider,
            api_key=api_key,
            system_prompt=SYSTEM_PROMPTS["chat"],
            user_prompt=prompt,
            max_tokens=2000,
            temperature=0.7
        )
        
        result = parse_llm_json_response(response)
        
        insert_line = result.get("insert_after_line", cursor_line)
        latex = result.get("latex", "")
        
        if not latex:
            raise HTTPException(status_code=500, detail="AI returned empty content")
        
        return ChatResponse(
            insert_after_line=insert_line,
            latex=latex
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)}")
