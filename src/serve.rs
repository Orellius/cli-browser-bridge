use crate::bridge::protocol::BridgeMessage;
use crate::config;
use crate::error::{BridgeError, Result};
use crate::lifecycle;
use crate::mcp::tools;
use crate::mcp::transport::{JsonRpcResponse, StdioTransport};

use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::time::{timeout, Duration};

type PendingMap = Arc<Mutex<HashMap<String, PendingRequest>>>;

struct PendingRequest {
    tx: oneshot::Sender<std::result::Result<Value, String>>,
    #[allow(dead_code)]
    tool: String,
    #[allow(dead_code)]
    args: Value,
}

/// Run the MCP serve mode: stdio transport + UDS listener.
pub async fn run(socket_path: PathBuf) -> Result<()> {
    let pidfile = config::pidfile_path();
    lifecycle::kill_stale(&pidfile);
    lifecycle::cleanup_socket(&socket_path);
    lifecycle::write_pidfile(&pidfile);

    let listener = UnixListener::bind(&socket_path)?;
    tracing::info!("UDS listening on {}", socket_path.display());

    let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));
    let (ext_tx, ext_rx) = mpsc::channel::<String>(256);
    let ext_tx = Arc::new(ext_tx);

    let extension_connected = Arc::new(Mutex::new(false));

    // Task: accept UDS connections from native host
    let pending_uds = pending.clone();
    let ext_connected = extension_connected.clone();
    let uds_handle = tokio::spawn(async move {
        uds_accept_loop(listener, pending_uds, ext_rx, ext_connected).await;
    });

    // Task: MCP stdio transport
    let result = mcp_loop(pending.clone(), ext_tx, extension_connected.clone()).await;

    // Shutdown
    uds_handle.abort();
    lifecycle::remove_pidfile(&pidfile);
    lifecycle::cleanup_socket(&socket_path);
    result
}

async fn mcp_loop(
    pending: PendingMap,
    ext_tx: Arc<mpsc::Sender<String>>,
    ext_connected: Arc<Mutex<bool>>,
) -> Result<()> {
    let mut transport = StdioTransport::new();
    let tool_defs = tools::all_tools();

    loop {
        let req = match transport.read().await? {
            Some(r) => r,
            None => {
                tracing::info!("stdin EOF — shutting down");
                return Ok(());
            }
        };

        let response = match req.method.as_str() {
            "initialize" => JsonRpcResponse::success(
                req.id,
                json!({
                    "protocolVersion": config::MCP_PROTOCOL_VERSION,
                    "capabilities": { "tools": {} },
                    "serverInfo": {
                        "name": config::MCP_SERVER_NAME,
                        "version": config::MCP_SERVER_VERSION
                    }
                }),
            ),
            "notifications/initialized" | "notifications/cancelled" => continue,
            "ping" => JsonRpcResponse::success(req.id, json!({})),
            "tools/list" => {
                let tools_json: Vec<Value> = tool_defs.iter().map(|t| t.to_json()).collect();
                JsonRpcResponse::success(req.id, json!({ "tools": tools_json }))
            }
            "tools/call" => {
                let resp = handle_tool_call(
                    &req.params,
                    &pending,
                    &ext_tx,
                    &ext_connected,
                )
                .await;
                match resp {
                    Ok(result) => JsonRpcResponse::success(req.id, result),
                    Err(e) => JsonRpcResponse::error(req.id, -32000, e.to_string()),
                }
            }
            _ => JsonRpcResponse::error(
                req.id,
                -32601,
                format!("method not found: {}", req.method),
            ),
        };

        transport.write(&response).await?;
    }
}

async fn handle_tool_call(
    params: &Option<Value>,
    pending: &PendingMap,
    ext_tx: &Arc<mpsc::Sender<String>>,
    ext_connected: &Arc<Mutex<bool>>,
) -> Result<Value> {
    let params = params.as_ref().ok_or(BridgeError::Other("missing params".into()))?;
    let tool_name = params["name"].as_str().unwrap_or("");
    let mut args = params.get("arguments").cloned().unwrap_or(json!({}));

    coerce_args(&mut args);

    if !*ext_connected.lock().await {
        return Err(BridgeError::ExtensionNotConnected);
    }

    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();

    let msg = BridgeMessage::ToolRequest {
        id: id.clone(),
        tool: tool_name.to_string(),
        args: args.clone(),
    };
    let msg_str = serde_json::to_string(&msg)?;

    {
        let mut map = pending.lock().await;
        map.insert(
            id.clone(),
            PendingRequest {
                tx,
                tool: tool_name.to_string(),
                args,
            },
        );
    }

    if ext_tx.send(msg_str).await.is_err() {
        pending.lock().await.remove(&id);
        return Err(BridgeError::ExtensionNotConnected);
    }

    match timeout(Duration::from_secs(config::TOOL_REQUEST_TIMEOUT_SECS), rx).await {
        Ok(Ok(Ok(result))) => Ok(result),
        Ok(Ok(Err(e))) => Ok(json!({ "content": [{ "type": "text", "text": e }], "isError": true })),
        Ok(Err(_)) => {
            pending.lock().await.remove(&id);
            Err(BridgeError::Timeout)
        }
        Err(_) => {
            pending.lock().await.remove(&id);
            Err(BridgeError::Timeout)
        }
    }
}

fn coerce_args(args: &mut Value) {
    if let Some(obj) = args.as_object_mut() {
        if let Some(Value::String(s)) = obj.get("tabId") {
            if let Ok(n) = s.parse::<f64>() {
                obj.insert("tabId".into(), json!(n));
            }
        }
        for key in &["coordinate", "start_coordinate", "region"] {
            if let Some(Value::String(s)) = obj.get(*key) {
                if let Ok(v) = serde_json::from_str::<Value>(s) {
                    obj.insert((*key).into(), v);
                }
            }
        }
    }
}

async fn uds_accept_loop(
    listener: UnixListener,
    pending: PendingMap,
    mut ext_rx: mpsc::Receiver<String>,
    ext_connected: Arc<Mutex<bool>>,
) {
    loop {
        tokio::select! {
            accept = listener.accept() => {
                match accept {
                    Ok((stream, _)) => {
                        tracing::info!("native host connected");
                        *ext_connected.lock().await = true;
                        handle_uds_connection(stream, &pending, &mut ext_rx, &ext_connected).await;
                        tracing::info!("native host disconnected");
                        *ext_connected.lock().await = false;
                    }
                    Err(e) => tracing::error!("UDS accept error: {e}"),
                }
            }
            // Drain messages while no host is connected
            msg = ext_rx.recv() => {
                if msg.is_none() { return; }
                tracing::warn!("tool request dropped — no native host connected");
            }
        }
    }
}

async fn handle_uds_connection(
    stream: UnixStream,
    pending: &PendingMap,
    ext_rx: &mut mpsc::Receiver<String>,
    _ext_connected: &Arc<Mutex<bool>>,
) {
    let (reader, writer) = stream.into_split();
    let mut reader = BufReader::new(reader);
    let writer = Arc::new(Mutex::new(writer));

    loop {
        let mut line = String::new();
        tokio::select! {
            // Read from native host
            result = reader.read_line(&mut line) => {
                match result {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {
                        if let Ok(msg) = serde_json::from_str::<BridgeMessage>(line.trim()) {
                            match msg {
                                BridgeMessage::Heartbeat => {},
                                BridgeMessage::ToolResponse { id, result } => {
                                    if let Some(req) = pending.lock().await.remove(&id) {
                                        let _ = req.tx.send(Ok(result));
                                    }
                                }
                                BridgeMessage::ToolError { id, error } => {
                                    if let Some(req) = pending.lock().await.remove(&id) {
                                        let _ = req.tx.send(Err(error));
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            // Forward tool requests to native host
            msg = ext_rx.recv() => {
                match msg {
                    Some(data) => {
                        let mut w = writer.lock().await;
                        if w.write_all(data.as_bytes()).await.is_err() { break; }
                        if w.write_all(b"\n").await.is_err() { break; }
                        if w.flush().await.is_err() { break; }
                    }
                    None => break,
                }
            }
        }
    }
}
