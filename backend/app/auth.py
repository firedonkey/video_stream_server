from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from . import database
import os
from dotenv import load_dotenv
import requests
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

# Load environment variables
load_dotenv()

# Create router
router = APIRouter()

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")  # Fallback for development
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# User models
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(BaseModel):
    email: str
    password: str

class User(UserBase):
    id: int
    is_active: bool
    is_superuser: bool

    class Config:
        from_attributes = True

# Token model
class Token(BaseModel):
    access_token: str
    token_type: str

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def get_user_by_email(db: Session, email: str):
    return db.query(database.User).filter(database.User.email == email).first()

def authenticate_user(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def db_user_to_pydantic(db_user):
    return User(
        id=db_user.id,
        email=db_user.email,
        is_active=db_user.is_active,
        is_superuser=db_user.is_superuser
    )

@router.post("/api/register", response_model=User)
def register_user(user: UserCreate, db: Session = Depends(database.get_db)):
    db_user = get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = database.User(
        email=user.email,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user_to_pydantic(db_user)

@router.post("/api/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db)
):
    print(f"Login attempt for email: {form_data.username}")  # username field is used for email
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        print(f"Login failed for email: {form_data.username}")
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    print(f"Login successful for email: {form_data.username}")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"token": access_token, "token_type": "bearer"}

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(database.get_db)
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
    user = get_user_by_email(db, email)
    if user is None:
        raise credentials_exception
    return user

@router.post("/api/google-login")
async def google_login(credential: dict, db: Session = Depends(database.get_db)):
    print("Received Google login request")
    print("Credential:", credential)
    
    try:
        print("Verifying Google token...")
        # Verify the Google token
        idinfo = id_token.verify_oauth2_token(
            credential["credential"], 
            google_requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        print("Token verified successfully")
        print("Token info:", idinfo)

        # Get user email from the token
        email = idinfo["email"]
        print(f"User email: {email}")
        
        # Check if user exists
        user = get_user_by_email(db, email)
        print(f"Existing user found: {user is not None}")
        
        # If user doesn't exist, create a new one
        if not user:
            print("Creating new user...")
            user = database.User(
                email=email,
                hashed_password="",  # No password for Google users
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print("New user created")
        
        # Create access token
        print("Creating access token...")
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email}, 
            expires_delta=access_token_expires
        )
        print("Access token created successfully")
        
        return {"token": access_token, "token_type": "bearer"}
        
    except Exception as e:
        print(f"Google login error: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=401,
            detail="Invalid Google credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) 