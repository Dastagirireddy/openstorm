use std::fmt;

#[derive(Debug)]
pub enum GraphError {
    SqliteError(rusqlite::Error),
    IoError(std::io::Error),
    ParseError(String),
    NotFound(String),
}

impl fmt::Display for GraphError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SqliteError(e) => write!(f, "Database error: {}", e),
            Self::IoError(e) => write!(f, "IO error: {}", e),
            Self::ParseError(msg) => write!(f, "Parse error: {}", msg),
            Self::NotFound(msg) => write!(f, "Not found: {}", msg),
        }
    }
}

impl std::error::Error for GraphError {}

impl From<rusqlite::Error> for GraphError {
    fn from(e: rusqlite::Error) -> Self {
        Self::SqliteError(e)
    }
}

impl From<std::io::Error> for GraphError {
    fn from(e: std::io::Error) -> Self {
        Self::IoError(e)
    }
}

pub type GraphResult<T> = Result<T, GraphError>;
