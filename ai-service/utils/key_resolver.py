import os
import httpx
from typing import Optional, Tuple

APP_INTERNAL_URL = os.getenv("APP_INTERNAL_URL", "http://host.docker.internal:3000")
AI_INTERNAL_SECRET = os.getenv("AI_INTERNAL_SECRET", "")


async def resolve_user_key(user_id: str) -> Tuple[str, str]:
    """
    Fetch the decrypted API key for a user from the Node.js backend.
    
    Returns:
        Tuple of (provider, decrypted_key)
    
    Raises:
        Exception if key cannot be resolved
    """
    if not AI_INTERNAL_SECRET:
        raise Exception("AI_INTERNAL_SECRET not configured")
    
    url = f"{APP_INTERNAL_URL}/internal/user/{user_id}/api-key"
    headers = {
        "X-Internal-Secret": AI_INTERNAL_SECRET
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(url, headers=headers)
            
            if response.status_code == 404:
                raise Exception("User has not configured an API key")
            
            if response.status_code == 403:
                raise Exception("Invalid internal secret")
            
            if response.status_code != 200:
                raise Exception(f"Failed to fetch API key: {response.status_code}")
            
            data = response.json()
            provider = data.get("provider", "openai")
            key = data.get("key")
            
            if not key:
                raise Exception("No API key found for user")
            
            return provider, key
            
        except httpx.RequestError as e:
            raise Exception(f"Failed to connect to app server: {str(e)}")


async def get_key_for_provider(user_id: str, required_provider: Optional[str] = None) -> Tuple[str, str]:
    """
    Get the user's API key, optionally validating it matches a specific provider.
    
    Args:
        user_id: The user's ID
        required_provider: If set, validate the key is for this provider
    
    Returns:
        Tuple of (provider, key)
    """
    provider, key = await resolve_user_key(user_id)
    
    if required_provider and provider != required_provider:
        raise Exception(f"Required provider '{required_provider}' but user has '{provider}' configured")
    
    return provider, key
