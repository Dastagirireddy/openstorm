"""{{project-name}} - A Python package."""


def hello(name: str = None) -> str:
    """Return a greeting message.

    Args:
        name: Optional name to greet. Defaults to None.

    Returns:
        A greeting string.
    """
    if name:
        return f"Hello, {name}!"
    return f"Hello from {{project-name}}!"
