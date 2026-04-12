use super::tools::{Tool, tab_prop};
use serde_json::json;

pub fn advanced_tools() -> Vec<Tool> {
    vec![
        Tool {
            name: "wait_for",
            description: "Wait for a condition: element visible/hidden, text match, network idle, or JS predicate.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tabId": tab_prop(),
                    "condition": { "type": "string", "enum": ["element_visible","element_hidden","text_match","network_idle","js_predicate"] },
                    "selector": { "type": "string", "description": "CSS selector for element conditions." },
                    "text": { "type": "string", "description": "Text/regex for text_match." },
                    "predicate": { "type": "string", "description": "JS expression for js_predicate." },
                    "timeout": { "type": "number", "description": "Max seconds (default 10, max 30)." },
                    "pierceShadow": { "type": "boolean", "description": "Search Shadow DOM (default true)." }
                },
                "required": ["tabId", "condition"]
            }),
        },
        Tool {
            name: "storage",
            description: "Read/write localStorage, sessionStorage, cookies for the current page.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tabId": tab_prop(),
                    "action": { "type": "string", "enum": ["get","set","delete","list","get_cookies"] },
                    "store": { "type": "string", "enum": ["localStorage","sessionStorage"] },
                    "key": { "type": "string" },
                    "value": { "type": "string" }
                },
                "required": ["tabId", "action"]
            }),
        },
        Tool {
            name: "dom_query",
            description: "CSS selector query with Shadow DOM piercing, computed styles, bounding rects.",
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tabId": tab_prop(),
                    "selector": { "type": "string", "description": "CSS selector." },
                    "pierceShadow": { "type": "boolean", "description": "Traverse Shadow DOM (default true)." },
                    "includeStyles": { "type": "boolean", "description": "Include computed styles." },
                    "limit": { "type": "number", "description": "Max results (default 20)." }
                },
                "required": ["tabId", "selector"]
            }),
        },
    ]
}
