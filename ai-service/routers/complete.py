from fastapi import APIRouter, HTTPException
from models import CompleteRequest, CompleteResponse
from utils.key_resolver import resolve_user_key
from utils.prompts import AUTOCOMPLETE_PROMPT, SYSTEM_PROMPTS
from utils.llm_client import call_llm

router = APIRouter()


def clean_completion(completion: str) -> str:
    """Clean up the completion text."""
    completion = completion.strip()
    
    if completion.startswith("```latex"):
        completion = completion[8:]
    elif completion.startswith("```"):
        completion = completion[3:]
    
    if completion.endswith("```"):
        completion = completion[:-3]
    
    return completion.strip()


@router.post("/complete", response_model=CompleteResponse)
async def complete(request: CompleteRequest):
    """Generate autocomplete suggestion for LaTeX document."""
    try:
        provider, api_key = await resolve_user_key(request.user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    prefix = request.prefix[-500:] if len(request.prefix) > 500 else request.prefix
    suffix = request.suffix[:200] if len(request.suffix) > 200 else request.suffix
    
    prompt = AUTOCOMPLETE_PROMPT.format(
        prefix=prefix,
        suffix=suffix
    )
    
    try:
        response = await call_llm(
            provider=provider,
            api_key=api_key,
            system_prompt=SYSTEM_PROMPTS["complete"],
            user_prompt=prompt,
            max_tokens=150,
            temperature=0.3
        )
        
        completion = clean_completion(response)
        
        return CompleteResponse(
            completion=completion
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)}")
