from pydantic import BaseModel, ConfigDict


class FlexibleDTO(BaseModel):
    """Базовий DTO-клас із підтримкою довільних додаткових полів для гнучкості схеми."""

    model_config = ConfigDict(extra="allow")
