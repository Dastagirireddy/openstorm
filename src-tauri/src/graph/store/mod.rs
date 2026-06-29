pub mod crud;
pub mod queries;
pub mod schema;

use rusqlite::Connection;

use super::errors::GraphResult;

pub struct GraphStore {
    conn: Connection,
}

impl GraphStore {
    pub fn open(db_path: &str) -> GraphResult<Self> {
        let conn = Connection::open(db_path)?;
        let store = Self { conn };
        store.init_schema()?;
        Ok(store)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    fn init_schema(&self) -> GraphResult<()> {
        schema::create_tables(&self.conn)?;
        Ok(())
    }
}
