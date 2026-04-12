use std::path::PathBuf;

pub const MCP_SERVER_NAME: &str = "cli-browser-bridge";
pub const MCP_SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

pub const MAX_NATIVE_MESSAGE_SIZE: u32 = 1024 * 1024; // 1MB Chrome limit
pub const TOOL_REQUEST_TIMEOUT_SECS: u64 = 60;
pub const HOST_RECONNECT_INTERVAL_MS: u64 = 500;
pub const HOST_MAX_RECONNECT_ATTEMPTS: u32 = 60;
pub const _RESEND_WINDOW_SECS: u64 = 5;

pub fn socket_path() -> PathBuf {
    let uid = unsafe { libc::getuid() };
    PathBuf::from(format!("/tmp/{MCP_SERVER_NAME}-{uid}.sock"))
}

pub fn pidfile_path() -> PathBuf {
    let uid = unsafe { libc::getuid() };
    PathBuf::from(format!("/tmp/{MCP_SERVER_NAME}-{uid}.pid"))
}

pub fn terms_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home)
        .join(".config")
        .join("orellius-browser-bridge")
        .join(".terms-accepted")
}
