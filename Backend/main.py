from fastapi import FastAPI

# create the API object
app = FastAPI(
    title="UMES AI Lost & Found API",
    description="Backend for the campus lost and found system",
    version="1.0.0"
)

# root endpoint
@app.get("/")
def read_root():
    return {"message": "AI Lost and Found API is running"}

# test endpoint
@app.get("/test")
def test():
    return {"status": "working"}