/// Database Introspector Trait - retrieves schema metadata
///
/// Each database provider implements this trait to expose
/// database structure (schemas, tables, columns, etc.)

use crate::database::{Result, ConnectionConfig};
use serde::{Deserialize, Serialize};

/// Database object types for tree view
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseObject {
    pub id: String,
    pub name: String,
    pub kind: ObjectKind,
    pub icon: String,
    pub children: Option<Vec<DatabaseObject>>,
    pub expanded: bool,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ObjectKind {
    Database,
    Schema,
    Table,
    View,
    Column,
    Index,
    Function,
    Procedure,
    Collection, // MongoDB
    Key,        // Redis
}

/// Database introspector interface
pub trait DatabaseIntrospector: Send + Sync {
    /// Get root database object (databases/schemas)
    fn get_root_objects(&self, config: &ConnectionConfig) -> Result<Vec<DatabaseObject>>;

    /// Get children of a specific object (e.g., tables in schema, columns in table)
    fn get_children(&self, config: &ConnectionConfig, parent: &DatabaseObject) -> Result<Vec<DatabaseObject>>;

    /// Get detailed metadata for a specific object
    fn get_object_details(&self, config: &ConnectionConfig, object: &DatabaseObject) -> Result<serde_json::Value>;
}
