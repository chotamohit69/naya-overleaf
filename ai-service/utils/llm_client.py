import os
from typing import Optional

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None

try:
    from anthropic import AsyncAnthropic
except ImportError:
    AsyncAnthropic = None

try:
    import google.generativeai as genai
except ImportError:
    genai = None


async def call_openai(api_key: str, system_prompt: str, user_prompt: str, 
                      max_tokens: int = 500, temperature: float = 0.3) -> str:
    """Call OpenAI API."""
    if AsyncOpenAI is None:
        raise Exception("OpenAI package not installed")
    
    client = AsyncOpenAI(api_key=api_key)
    
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=max_tokens,
        temperature=temperature
    )
    
    return response.choices[0].message.content


async def call_anthropic(api_key: str, system_prompt: str, user_prompt: str,
                        max_tokens: int = 500, temperature: float = 0.3) -> str:
    """Call Anthropic API."""
    if AsyncAnthropic is None:
        raise Exception("Anthropic package not installed")
    
    client = AsyncAnthropic(api_key=api_key)
    
    response = await client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_prompt}
        ]
    )
    
    return response.content[0].text


async def call_gemini(api_key: str, system_prompt: str, user_prompt: str,
                      max_tokens: int = 500, temperature: float = 0.3) -> str:
    """Call Google Gemini API."""
    if genai is None:
        raise Exception("Google Generative AI package not installed")
    
    genai.configure(api_key=api_key)
    
    model = genai.GenerativeModel(
        model_name="gemini-1.5-pro",
        system_instruction=system_prompt
    )
    
    response = await model.generate_content_async(
        user_prompt,
        generation_config=genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature
        )
    )
    
    return response.text


async def call_llm(provider: str, api_key: str, system_prompt: str, user_prompt: str,
                   max_tokens: int = 500, temperature: float = 0.3) -> str:
    """
    Call the appropriate LLM provider based on the provider string.
    
    Args:
        provider: One of 'openai', 'anthropic', 'gemini'
        api_key: The API key for the provider
        system_prompt: System prompt to use
        user_prompt: User prompt to use
        max_tokens: Maximum tokens to generate
        temperature: Temperature for generation
    
    Returns:
        The generated text response
    """
    provider = provider.lower().strip()
    
    if provider == "openai":
        return await call_openai(api_key, system_prompt, user_prompt, max_tokens, temperature)
    elif provider == "anthropic":
        return await call_anthropic(api_key, system_prompt, user_prompt, max_tokens, temperature)
    elif provider == "gemini":
        return await call_gemini(api_key, system_prompt, user_prompt, max_tokens, temperature)
    else:
        raise Exception(f"Unsupported LLM provider: {provider}")
