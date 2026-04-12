use crate::config;
use crate::error::Result;
use crate::native_messaging;

use std::io;
use std::path::PathBuf;
use crate::ipc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

/// Run native messaging host mode.
/// Bridges Chrome's native messaging (stdin/stdout) ↔ Unix domain socket (to serve).
pub async fn run(socket_path: PathBuf) -> Result<()> {
    let (nm_tx, mut nm_rx) = mpsc::channel::<serde_json::Value>(128);
    let (uds_tx, uds_rx) = mpsc::channel::<serde_json::Value>(128);

    // Spawn blocking stdin reader (native messaging uses sync I/O)
    let stdin_handle = tokio::task::spawn_blocking(move || {
        read_native_stdin(nm_tx);
    });

    // Spawn blocking stdout writer (StdoutLock is not Send)
    let stdout_handle = tokio::task::spawn_blocking(move || {
        write_native_stdout_blocking(uds_rx);
    });

    // Main loop: connect to UDS, bridge messages
    let stream = connect_ipc(&socket_path).await?;
    let (reader, writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let writer = std::sync::Arc::new(tokio::sync::Mutex::new(writer));

    loop {
        let mut line = String::new();
        tokio::select! {
            // From UDS (serve → host → Chrome)
            result = reader.read_line(&mut line) => {
                match result {
                    Ok(0) => {
                        tracing::info!("UDS connection closed, reconnecting...");
                        drop(reader);
                        match reconnect_ipc(&socket_path).await {
                            Some(new_stream) => {
                                let stream = new_stream;
                                let (r, w) = stream.into_split();
                                reader = BufReader::new(r);
                                *writer.lock().await = w;
                                continue;
                            }
                            None => break,
                        }
                    }
                    Ok(_) => {
                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line.trim()) {
                            let _ = uds_tx.send(msg).await;
                        }
                    }
                    Err(e) => {
                        tracing::error!("UDS read error: {e}");
                        break;
                    }
                }
            }
            // From Chrome (native messaging → host → serve)
            msg = nm_rx.recv() => {
                match msg {
                    Some(data) => {
                        let serialized = match serde_json::to_string(&data) {
                            Ok(s) => s,
                            Err(_) => continue,
                        };
                        let mut w = writer.lock().await;
                        if w.write_all(serialized.as_bytes()).await.is_err() { break; }
                        if w.write_all(b"\n").await.is_err() { break; }
                        if w.flush().await.is_err() { break; }
                    }
                    None => break, // stdin closed
                }
            }
        }
    }

    stdin_handle.abort();
    stdout_handle.abort();
    Ok(())
}

/// Blocking: read native messages from stdin and send to channel.
fn read_native_stdin(tx: mpsc::Sender<serde_json::Value>) {
    let mut stdin = io::stdin().lock();
    loop {
        match native_messaging::read_message(&mut stdin) {
            Ok(Some(msg)) => {
                if tx.blocking_send(msg).is_err() {
                    break;
                }
            }
            Ok(None) => {
                tracing::info!("stdin EOF — Chrome disconnected");
                break;
            }
            Err(e) => {
                tracing::error!("native message read error: {e}");
                break;
            }
        }
    }
}

/// Write native messages from channel to stdout (spawned as blocking task).
fn write_native_stdout_blocking(mut rx: mpsc::Receiver<serde_json::Value>) {
    let mut stdout = io::stdout().lock();
    while let Some(msg) = rx.blocking_recv() {
        if native_messaging::write_message(&mut stdout, &msg).is_err() {
            break;
        }
    }
}

/// Connect to the IPC endpoint with retries.
async fn connect_ipc(path: &PathBuf) -> Result<ipc::IpcStream> {
    for attempt in 0..config::HOST_MAX_RECONNECT_ATTEMPTS {
        match ipc::connect(path).await {
            Ok(stream) => {
                tracing::info!("connected to serve via UDS");
                return Ok(stream);
            }
            Err(_) if attempt < config::HOST_MAX_RECONNECT_ATTEMPTS - 1 => {
                sleep(Duration::from_millis(config::HOST_RECONNECT_INTERVAL_MS)).await;
            }
            Err(e) => return Err(e.into()),
        }
    }
    unreachable!()
}

async fn reconnect_ipc(path: &PathBuf) -> Option<ipc::IpcStream> {
    for _ in 0..config::HOST_MAX_RECONNECT_ATTEMPTS {
        sleep(Duration::from_millis(config::HOST_RECONNECT_INTERVAL_MS)).await;
        if let Ok(stream) = ipc::connect(path).await {
            tracing::info!("reconnected to serve via UDS");
            return Some(stream);
        }
    }
    tracing::error!("failed to reconnect after {} attempts", config::HOST_MAX_RECONNECT_ATTEMPTS);
    None
}
