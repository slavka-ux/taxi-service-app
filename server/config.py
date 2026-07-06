"""Базова конфігурація."""
import os

class BaseConfig:
    """Базова конфігурація."""
    PROJECT_NAME = "SkyBook"
    VERSION = "1.0.0"
    BASE_URL = "/skybook/"
    DEBUG = False
    HOST = "0.0.0.0"
    PORT = 3000

class DevelopmentConfig(BaseConfig):
    """Конфігурація розробки."""
    DEBUG = True

config = {
    "development": DevelopmentConfig,
    "default": DevelopmentConfig
}