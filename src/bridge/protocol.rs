use serde::{Deserialize, Serialize};

/// Messages exchanged between serve (MCP server) and host (native messaging) over Unix domain socket.
/// Wire format: newline-delimited JSON.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BridgeMessage {
    #[serde(rename = "tool_request")]
    ToolRequest {
        id: String,
        tool: String,
        args: serde_json::Value,
    },
    #[serde(rename = "tool_response")]
    ToolResponse {
        id: String,
        result: serde_json::Value,
    },
    #[serde(rename = "tool_error")]
    ToolError { id: String, error: String },
    #[serde(rename = "heartbeat")]
    Heartbeat,
    #[serde(rename = "error")]
    Error { error: String },
}
