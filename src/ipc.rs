/// Platform IPC: Unix domain sockets on Unix, TCP localhost on Windows.
use std::io;
use std::path::PathBuf;
use tokio::io::{AsyncRead, AsyncWrite};

// Re-export a unified stream type
#[cfg(unix)]
pub type IpcStream = tokio::net::UnixStream;
#[cfg(windows)]
pub type IpcStream = tokio::net::TcpStream;

// --- Listener ---

pub struct IpcListener {
    #[cfg(unix)]
    inner: tokio::net::UnixListener,
    #[cfg(windows)]
    inner: tokio::net::TcpListener,
}

impl IpcListener {
    #[cfg(unix)]
    pub fn bind(path: &PathBuf) -> io::Result<Self> {
        let inner = tokio::net::UnixListener::bind(path)?;
        Ok(Self { inner })
    }

    #[cfg(windows)]
    pub fn bind(_path: &PathBuf) -> io::Result<Self> {
        let addr = format!("127.0.0.1:{}", crate::config::WINDOWS_TCP_PORT);
        let std_listener = std::net::TcpListener::bind(&addr)?;
        std_listener.set_nonblocking(true)?;
        let inner = tokio::net::TcpListener::from_std(std_listener)?;
        Ok(Self { inner })
    }

    pub async fn accept(&self) -> io::Result<IpcStream> {
        #[cfg(unix)]
        {
            let (stream, _) = self.inner.accept().await?;
            Ok(stream)
        }
        #[cfg(windows)]
        {
            let (stream, _) = self.inner.accept().await?;
            Ok(stream)
        }
    }
}

// --- Connect (client side) ---

#[cfg(unix)]
pub async fn connect(path: &PathBuf) -> io::Result<IpcStream> {
    tokio::net::UnixStream::connect(path).await
}

#[cfg(windows)]
pub async fn connect(_path: &PathBuf) -> io::Result<IpcStream> {
    let addr = format!("127.0.0.1:{}", crate::config::WINDOWS_TCP_PORT);
    tokio::net::TcpStream::connect(&addr).await
}
