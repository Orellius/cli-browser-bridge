use serde_json::{json, Value};

pub struct Tool {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
}

impl Tool {
    pub fn to_json(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
        })
    }
}

pub fn tab_prop() -> Value {
    json!({ "type": "number", "description": "Tab ID in the MCP group. Use tabs_context_mcp first." })
}

fn coord_prop(desc: &str) -> Value {
    json!({ "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2, "description": desc })
}

pub fn all_tools() -> Vec<Tool> {
    let mut tools = vec![
        tabs_context(), tabs_create(), navigate_tool(), computer_tool(),
        find_tool(), form_input(), get_page_text(), gif_creator(),
        javascript_tool(), console_tool(), network_tool(), read_page_tool(),
        resize_window(), shortcuts_list(), shortcuts_execute(),
        switch_browser(), update_plan(), upload_image(),
    ];
    tools.extend(super::tools_advanced::advanced_tools());
    tools
}

// === Core 18 tools ===

fn tabs_context() -> Tool {
    Tool {
        name: "tabs_context_mcp",
        description: "Get MCP tab group context. Returns all tab IDs. CRITICAL: call first in any conversation.",
        input_schema: json!({
            "type": "object",
            "properties": { "createIfEmpty": { "type": "boolean", "description": "Create MCP group if none exists." } }
        }),
    }
}

fn tabs_create() -> Tool {
    Tool {
        name: "tabs_create_mcp",
        description: "Create a new empty tab in the MCP tab group.",
        input_schema: json!({ "type": "object", "properties": {} }),
    }
}

fn navigate_tool() -> Tool {
    Tool {
        name: "navigate",
        description: "Navigate to a URL, or go forward/back in browser history.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "url": { "type": "string", "description": "URL or \"forward\"/\"back\"." },
                "tabId": tab_prop()
            },
            "required": ["url", "tabId"]
        }),
    }
}

fn computer_tool() -> Tool {
    Tool {
        name: "computer",
        description: "Mouse/keyboard interaction and screenshots.\n* Click at center of elements.\n* Take screenshot first to find coordinates.\n* Use humanlike:true for realistic typing with variable delays and natural rhythm.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ["left_click","right_click","double_click","triple_click","type","screenshot","wait","scroll","key","left_click_drag","zoom","scroll_to","hover"] },
                "tabId": tab_prop(),
                "coordinate": coord_prop("(x, y) for clicks/scroll."),
                "duration": { "type": "number", "minimum": 0, "maximum": 30, "description": "Wait seconds." },
                "modifiers": { "type": "string", "description": "Modifier keys: ctrl+shift, cmd+alt, etc." },
                "ref": { "type": "string", "description": "Element ref ID (alternative to coordinate)." },
                "region": { "type": "array", "items": {"type":"number"}, "minItems": 4, "maxItems": 4, "description": "Zoom region (x0,y0,x1,y1)." },
                "repeat": { "type": "number", "minimum": 1, "maximum": 100 },
                "scroll_direction": { "type": "string", "enum": ["up","down","left","right"] },
                "scroll_amount": { "type": "number", "minimum": 1, "maximum": 10 },
                "start_coordinate": coord_prop("Drag start position."),
                "text": { "type": "string", "description": "Text to type or keys to press." },
                "humanlike": { "type": "boolean", "description": "Type with human-like variable delays (50-200ms), occasional pauses between words, natural rhythm. Default false." }
            },
            "required": ["action", "tabId"]
        }),
    }
}

fn find_tool() -> Tool {
    Tool {
        name: "find",
        description: "Find elements by natural language. Returns up to 20 matches with refs. Pierces Shadow DOM.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "query": { "type": "string", "description": "Natural language (e.g. \"search bar\", \"login button\")." },
                "tabId": tab_prop(),
                "pierceShadow": { "type": "boolean", "description": "Search inside Shadow DOM roots (default true)." }
            },
            "required": ["query", "tabId"]
        }),
    }
}

fn form_input() -> Tool {
    Tool {
        name: "form_input",
        description: "Set form element values by ref ID. Works with Shadow DOM elements.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "ref": { "type": "string", "description": "Element ref (e.g. \"ref_1\")." },
                "value": { "description": "Value: boolean for checkboxes, string/number for others." },
                "tabId": tab_prop()
            },
            "required": ["ref", "value", "tabId"]
        }),
    }
}

fn get_page_text() -> Tool {
    Tool {
        name: "get_page_text",
        description: "Extract clean text content from the page, prioritizing article/main content.",
        input_schema: json!({
            "type": "object",
            "properties": { "tabId": tab_prop() },
            "required": ["tabId"]
        }),
    }
}

fn gif_creator() -> Tool {
    Tool {
        name: "gif_creator",
        description: "Record browser sessions and export as animated GIF with click overlays.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ["start_recording","stop_recording","export","clear"] },
                "tabId": tab_prop(),
                "download": { "type": "boolean" },
                "filename": { "type": "string" },
                "options": { "type": "object", "properties": {
                    "showClickIndicators": {"type":"boolean"}, "showDragPaths": {"type":"boolean"},
                    "showActionLabels": {"type":"boolean"}, "showProgressBar": {"type":"boolean"},
                    "showWatermark": {"type":"boolean"}, "quality": {"type":"number"}
                }}
            },
            "required": ["action", "tabId"]
        }),
    }
}

fn javascript_tool() -> Tool {
    Tool {
        name: "javascript_tool",
        description: "Execute JavaScript in the page context. Returns result of last expression.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ["javascript_exec"] },
                "text": { "type": "string", "description": "JS code. Don't use 'return'." },
                "tabId": tab_prop()
            },
            "required": ["action", "text", "tabId"]
        }),
    }
}

fn console_tool() -> Tool {
    Tool {
        name: "read_console_messages",
        description: "Read filtered browser console messages.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "tabId": tab_prop(),
                "pattern": { "type": "string", "description": "Regex filter." },
                "limit": { "type": "number" }, "onlyErrors": { "type": "boolean" }, "clear": { "type": "boolean" }
            },
            "required": ["tabId"]
        }),
    }
}

fn network_tool() -> Tool {
    Tool {
        name: "read_network_requests",
        description: "Read HTTP network requests from a tab.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "tabId": tab_prop(),
                "urlPattern": { "type": "string" }, "limit": { "type": "number" }, "clear": { "type": "boolean" }
            },
            "required": ["tabId"]
        }),
    }
}

fn read_page_tool() -> Tool {
    Tool {
        name: "read_page",
        description: "Accessibility tree with stable element refs. Pierces Shadow DOM by default.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "tabId": tab_prop(),
                "filter": { "type": "string", "enum": ["interactive","all"] },
                "depth": { "type": "number" },
                "ref_id": { "type": "string" },
                "max_chars": { "type": "number" },
                "pierceShadow": { "type": "boolean", "description": "Traverse into Shadow DOM (default true)." }
            },
            "required": ["tabId"]
        }),
    }
}

fn resize_window() -> Tool {
    Tool {
        name: "resize_window",
        description: "Resize browser window.",
        input_schema: json!({
            "type": "object",
            "properties": { "width": {"type":"number"}, "height": {"type":"number"}, "tabId": tab_prop() },
            "required": ["width", "height", "tabId"]
        }),
    }
}

fn shortcuts_list() -> Tool {
    Tool { name: "shortcuts_list", description: "List available shortcuts and workflows.",
        input_schema: json!({"type":"object","properties":{"tabId":tab_prop()},"required":["tabId"]}) }
}

fn shortcuts_execute() -> Tool {
    Tool { name: "shortcuts_execute", description: "Execute a shortcut or workflow.",
        input_schema: json!({"type":"object","properties":{"tabId":tab_prop(),"shortcutId":{"type":"string"},"command":{"type":"string"}},"required":["tabId"]}) }
}

fn switch_browser() -> Tool {
    Tool { name: "switch_browser", description: "Switch automation to a different Chromium browser.",
        input_schema: json!({"type":"object","properties":{}}) }
}

fn update_plan() -> Tool {
    Tool {
        name: "update_plan",
        description: "Present planned actions and target domains for user approval.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "domains": { "type": "array", "items": {"type":"string"} },
                "approach": { "type": "array", "items": {"type":"string"} }
            },
            "required": ["domains", "approach"]
        }),
    }
}

fn upload_image() -> Tool {
    Tool {
        name: "upload_image",
        description: "Upload captured screenshot to file input or drag & drop target.",
        input_schema: json!({
            "type": "object",
            "properties": {
                "imageId": {"type":"string"}, "tabId": tab_prop(),
                "ref": {"type":"string"}, "coordinate": coord_prop("Drop target."),
                "filename": {"type":"string"}
            },
            "required": ["imageId", "tabId"]
        }),
    }
}

