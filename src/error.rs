use thiserror::Error;

#[derive(Error, Debug)]
pub enum BridgeError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("extension not connected")]
    ExtensionNotConnected,

    #[error("tool request timed out")]
    Timeout,

    #[error("native message too large: {0} bytes")]
    MessageTooLarge(u32),

    #[error("terms of use not accepted")]
    TermsNotAccepted,

    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, BridgeError>;
