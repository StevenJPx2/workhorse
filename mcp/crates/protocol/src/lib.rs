#![doc = "Wire contracts for attaching MCP servers to the Workhorse capability daemon."]

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderManifest {
    pub id: String,
    pub version: String,
    pub component: String,
    pub capabilities: Vec<CapabilityManifest>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityManifest {
    pub name: String,
    pub operations: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityRequest {
    pub name: String,
    #[serde(default)]
    pub permissions: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ClientMessage {
    Attach {
        protocol_version: u32,
        client_id: String,
        capabilities: Vec<CapabilityRequest>,
    },
    Invoke {
        request_id: String,
        lease_id: String,
        capability: String,
        operation: String,
        input: Value,
    },
    Detach {
        lease_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DaemonMessage {
    Attached {
        lease_id: String,
        granted: Vec<CapabilityRequest>,
    },
    Result {
        request_id: String,
        output: Value,
    },
    Error {
        request_id: Option<String>,
        code: String,
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unknown_capabilities_round_trip_without_a_registry() {
        let message = ClientMessage::Attach {
            protocol_version: PROTOCOL_VERSION,
            client_id: "example-mcp".into(),
            capabilities: vec![CapabilityRequest {
                name: "future.capability".into(),
                permissions: json!({ "scope": ["anything"] }),
            }],
        };

        let encoded = serde_json::to_string(&message).expect("message should serialize");
        let decoded = serde_json::from_str(&encoded).expect("message should deserialize");

        assert_eq!(message, decoded);
    }
}
