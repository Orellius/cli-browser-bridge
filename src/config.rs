use std::path::PathBuf;

pub const MCP_SERVER_NAME: &str = "cli-browser-bridge";
pub const MCP_SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

pub const MAX_NATIVE_MESSAGE_SIZE: u32 = 1024 * 1024;
pub const TOOL_REQUEST_TIMEOUT_SECS: u64 = 60;
pub const HOST_RECONNECT_INTERVAL_MS: u64 = 500;
pub const HOST_MAX_RECONNECT_ATTEMPTS: u32 = 60;

/// IPC address: Unix socket path on Unix, TCP port on Windows.
pub const WINDOWS_TCP_PORT: u16 = 18710;

#[cfg(unix)]
pub fn socket_path() -> PathBuf {
    let uid = unsafe { libc::getuid() };
    PathBuf::from(format!("/tmp/{MCP_SERVER_NAME}-{uid}.sock"))
}

#[cfg(windows)]
pub fn socket_path() -> PathBuf {
    let tmp = std::env::var("TEMP").unwrap_or_else(|_| r"C:\Temp".into());
    PathBuf::from(tmp).join(format!("{MCP_SERVER_NAME}-{}.sock", std::process::id()))
}

pub fn pidfile_path() -> PathBuf {
    #[cfg(unix)]
    {
        let uid = unsafe { libc::getuid() };
        PathBuf::from(format!("/tmp/{MCP_SERVER_NAME}-{uid}.pid"))
    }
    #[cfg(windows)]
    {
        let tmp = std::env::var("TEMP").unwrap_or_else(|_| r"C:\Temp".into());
        PathBuf::from(tmp).join(format!("{MCP_SERVER_NAME}.pid"))
    }
}

pub fn terms_path() -> PathBuf {
    #[cfg(unix)]
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    #[cfg(windows)]
    let home = std::env::var("USERPROFILE").unwrap_or_else(|_| r"C:\Users\Public".into());

    PathBuf::from(home)
        .join(".config")
        .join("orellius-browser-bridge")
        .join(".terms-accepted")
}
