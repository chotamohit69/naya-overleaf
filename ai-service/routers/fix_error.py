from fastapi import APIRouter, HTTPException
from models import FixErrorRequest, FixErrorResponse
from utils.key_resolver import resolve_user_key
from utils.prompts import FIX_ERROR_PROMPT, SYSTEM_PROMPTS
from utils.llm_client import call_llm
import json
import re

router = APIRouter()


def extract_relevant_chunk(document_content: str, error_line: int = None, context_lines: int = 30) -> tuple:
    """Extract relevant portion of document around the error."""
    lines = document_content.split('\n')
    total_lines = len(lines)
    
    if error_line is not None:
        start = max(0, error_line - context_lines)
        end = min(total_lines, error_line + context_lines)
    else:
        start = 0
        end = min(total_lines, context_lines * 2)
    
    chunk = '\n'.join(lines[start:end])
    return chunk, start + 1, end


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


@router.post("/fix-error", response_model=FixErrorResponse)
async def fix_error(request: FixErrorRequest):
    """Analyze a LaTeX compilation error and suggest a fix."""
    try:
        provider, api_key = await resolve_user_key(request.user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    chunk, start_line, end_line = extract_relevant_chunk(
        request.document_content, 
        request.error_line
    )
    
    prompt = FIX_ERROR_PROMPT.format(
        error_log=request.error_log[:3000],
        document_chunk=chunk,
        start_line=start_line,
        end_line=end_line
    )
    
    try:
        response = await call_llm(
            provider=provider,
            api_key=api_key,
            system_prompt=SYSTEM_PROMPTS["fix_error"],
            user_prompt=prompt,
            max_tokens=500,
            temperature=0.3
        )
        
        result = parse_llm_json_response(response)
        
        if request.error_line and "line" in result.get("patch", {}):
            offset = start_line - 1
            result["patch"]["line"] = result["patch"]["line"] + offset
        
        return FixErrorResponse(
            explanation=result.get("explanation", "Unable to explain error"),
            patch=result.get("patch", {})
        )
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)}")
