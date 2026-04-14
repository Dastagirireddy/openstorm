from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(
    title="{{project-name}}",
    description="A FastAPI application",
    version="0.1.0"
)

class Item(BaseModel):
    name: str
    description: Optional[str] = None
    price: float

@app.get("/")
async def root():
    return {"message": "Hello from {{project-name}}!"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/items/")
async def create_item(item: Item):
    return {"item": item, "action": "created"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port={{port}})
