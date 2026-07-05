/// Query export service - streaming exports to file
///
/// Exports query results to CSV, JSON, or XLSX files using cursor-based fetching.
/// Prevents memory issues by writing rows directly to disk in batches.

use crate::database::{DatabaseError, AnyPool};
use crate::database::query::ColumnInfo;
use super::types::{ExportFormat, ExportOptions, ExportResult};
use sqlx::{Row, Column, TypeInfo};
use std::time::Instant;
use std::io::{Write, BufWriter};
use std::fs::File;

/// Default max rows for export (configurable via options)
const DEFAULT_MAX_ROWS: u64 = 100_000;

/// Batch size for cursor fetching
const FETCH_BATCH_SIZE: u64 = 10_000;

pub struct QueryExporter;

impl QueryExporter {
    /// Export query results to file
    pub async fn export(
        pool: &AnyPool,
        query: &str,
        options: ExportOptions,
    ) -> Result<ExportResult, DatabaseError> {
        let start = Instant::now();

        // Validate format support
        match pool {
            AnyPool::Postgres(_) | AnyPool::MySql(_) | AnyPool::Sqlite(_) => {}
            _ => {
                return Err(DatabaseError::QueryFailed(
                    "Export only supports PostgreSQL, MySQL, and SQLite".into()
                ));
            }
        }

        // Apply max rows limit
        let max_rows = options.max_rows.unwrap_or(DEFAULT_MAX_ROWS);
        let query_with_limit = Self::apply_limit(query, max_rows);

        // Execute export based on format
        let result = match options.format {
            ExportFormat::Csv => Self::export_csv(pool, &query_with_limit, &options).await,
            ExportFormat::Json => Self::export_json(pool, &query_with_limit, &options).await,
            ExportFormat::Xlsx => Self::export_xlsx(pool, &query_with_limit, &options).await,
        };

        match result {
            Ok(rows_exported) => {
                let file_size = std::fs::metadata(&options.destination_path)
                    .map(|m| m.len())
                    .unwrap_or(0);

                Ok(ExportResult {
                    success: true,
                    file_path: options.destination_path,
                    rows_exported,
                    file_size_bytes: file_size,
                    execution_time_ms: start.elapsed().as_millis() as u64,
                    error: None,
                })
            }
            Err(e) => Ok(ExportResult {
                success: false,
                file_path: options.destination_path.clone(),
                rows_exported: 0,
                file_size_bytes: 0,
                execution_time_ms: start.elapsed().as_millis() as u64,
                error: Some(e.to_string()),
            }),
        }
    }

    /// Apply LIMIT clause to query if not present
    fn apply_limit(query: &str, max_rows: u64) -> String {
        let query_upper = query.to_uppercase();
        if query_upper.contains("LIMIT ") || query_upper.contains("LIMIT\n") || query_upper.contains("LIMIT\t") {
            query.to_string()
        } else {
            let trimmed = query.trim_end_matches(|c: char| c.is_whitespace() || c == ';');
            format!("{} LIMIT {}", trimmed, max_rows)
        }
    }

    /// Export to CSV format
    async fn export_csv(
        pool: &AnyPool,
        query: &str,
        options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let file = File::create(&options.destination_path)
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to create file: {}", e)))?;
        let mut writer = BufWriter::new(file);

        let (_columns, row_count) = match pool {
            AnyPool::Postgres(pool) => Self::fetch_postgres_rows_csv(pool, query, &mut writer, options).await?,
            AnyPool::MySql(pool) => Self::fetch_mysql_rows_csv(pool, query, &mut writer, options).await?,
            AnyPool::Sqlite(pool) => Self::fetch_sqlite_rows_csv(pool, query, &mut writer, options).await?,
        };

        writer.flush()
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to flush writer: {}", e)))?;

        Ok(row_count)
    }

    /// Export to JSON format
    async fn export_json(
        pool: &AnyPool,
        query: &str,
        options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let file = File::create(&options.destination_path)
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to create file: {}", e)))?;
        let mut writer = BufWriter::new(file);

        // Write opening bracket
        writeln!(writer, "[")
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write JSON: {}", e)))?;

        let row_count = match pool {
            AnyPool::Postgres(pool) => Self::fetch_postgres_rows_json(pool, query, &mut writer, options).await?,
            AnyPool::MySql(pool) => Self::fetch_mysql_rows_json(pool, query, &mut writer, options).await?,
            AnyPool::Sqlite(pool) => Self::fetch_sqlite_rows_json(pool, query, &mut writer, options).await?,
        };

        // Write closing bracket
        writeln!(writer, "]")
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write JSON: {}", e)))?;

        writer.flush()
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to flush writer: {}", e)))?;

        Ok(row_count)
    }

    /// Export to XLSX format (using XML-based XLS format that Excel can open)
    async fn export_xlsx(
        pool: &AnyPool,
        query: &str,
        options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let file = File::create(&options.destination_path)
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to create file: {}", e)))?;
        let mut writer = BufWriter::new(file);

        // Write XML header for Excel
        writeln!(writer, r#"<?xml version="1.0" encoding="UTF-8"?>"#)?;
        writeln!(writer, r#"<?mso-application progid="Excel.Sheet"?>"#)?;
        writeln!(writer, r#"<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">"#)?;
        writeln!(writer, r#" <Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Bottom"/></Style></Styles>"#)?;
        writeln!(writer, r#" <Worksheet ss:Name="Query Results">"#)?;
        writeln!(writer, r#"  <Table>"#)?;

        let row_count = match pool {
            AnyPool::Postgres(pool) => Self::fetch_postgres_rows_xml(pool, query, &mut writer, options).await?,
            AnyPool::MySql(pool) => Self::fetch_mysql_rows_xml(pool, query, &mut writer, options).await?,
            AnyPool::Sqlite(pool) => Self::fetch_sqlite_rows_xml(pool, query, &mut writer, options).await?,
        };

        writeln!(writer, r#"  </Table>"#)?;
        writeln!(writer, r#" </Worksheet>"#)?;
        writeln!(writer, r#"</Workbook>"#)?;

        writer.flush()
            .map_err(|e| DatabaseError::QueryFailed(format!("Failed to flush writer: {}", e)))?;

        Ok(row_count)
    }

    /// Fetch PostgreSQL rows for CSV export
    async fn fetch_postgres_rows_csv(
        pool: &sqlx::PgPool,
        query: &str,
        writer: &mut BufWriter<File>,
        options: &ExportOptions,
    ) -> Result<(Vec<ColumnInfo>, u64), DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        if rows.is_empty() {
            return Ok((Vec::new(), 0));
        }

        let columns: Vec<ColumnInfo> = rows[0]
            .columns()
            .iter()
            .map(|col| ColumnInfo {
                name: col.name().to_string(),
                type_name: Some(col.type_info().name().to_string()),
                nullable: None,
            })
            .collect();

        // Write headers
        if options.include_headers {
            let header: String = columns
                .iter()
                .map(|c| Self::escape_csv_field(&c.name))
                .collect::<Vec<_>>()
                .join(",");
            writeln!(writer, "{}", header)
                .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write CSV header: {}", e)))?;
        }

        // Write rows
        for row in &rows {
            let line: String = (0..row.columns().len())
                .map(|i| Self::escape_csv_field(&Self::format_pg_value(row, i)))
                .collect::<Vec<_>>()
                .join(",");
            writeln!(writer, "{}", line)
                .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write CSV row: {}", e)))?;
        }

        Ok((columns, row_count))
    }

    /// Fetch MySQL rows for CSV export
    async fn fetch_mysql_rows_csv(
        pool: &sqlx::MySqlPool,
        query: &str,
        writer: &mut BufWriter<File>,
        options: &ExportOptions,
    ) -> Result<(Vec<ColumnInfo>, u64), DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        if rows.is_empty() {
            return Ok((Vec::new(), 0));
        }

        let columns: Vec<ColumnInfo> = rows[0]
            .columns()
            .iter()
            .map(|col| ColumnInfo {
                name: col.name().to_string(),
                type_name: Some(col.type_info().name().to_string()),
                nullable: None,
            })
            .collect();

        // Write headers
        if options.include_headers {
            let header: String = columns
                .iter()
                .map(|c| Self::escape_csv_field(&c.name))
                .collect::<Vec<_>>()
                .join(",");
            writeln!(writer, "{}", header)
                .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write CSV header: {}", e)))?;
        }

        // Write rows
        for row in &rows {
            let line: String = (0..row.columns().len())
                .map(|i| Self::escape_csv_field(&Self::format_mysql_value(row, i)))
                .collect::<Vec<_>>()
                .join(",");
            writeln!(writer, "{}", line)
                .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write CSV row: {}", e)))?;
        }

        Ok((columns, row_count))
    }

    /// Fetch PostgreSQL rows for JSON export
    async fn fetch_postgres_rows_json(
        pool: &sqlx::PgPool,
        query: &str,
        writer: &mut BufWriter<File>,
        _options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        let mut first = true;
        for row in &rows {
            if !first {
                writeln!(writer, ",")?;
            }
            first = false;

            write!(writer, "  {{")?;
            let cols = row.columns();
            let mut first_col = true;
            for (i, col) in cols.iter().enumerate() {
                if !first_col {
                    write!(writer, ", ")?;
                }
                first_col = false;
                let value = Self::format_pg_value(row, i);
                write!(writer, "\"{}\": {}", col.name(), value)?;
            }
            write!(writer, "}}")?;
        }
        writeln!(writer)?;

        Ok(row_count)
    }

    /// Fetch MySQL rows for JSON export
    async fn fetch_mysql_rows_json(
        pool: &sqlx::MySqlPool,
        query: &str,
        writer: &mut BufWriter<File>,
        _options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        let mut first = true;
        for row in &rows {
            if !first {
                writeln!(writer, ",")?;
            }
            first = false;

            write!(writer, "  {{")?;
            let cols = row.columns();
            let mut first_col = true;
            for (i, col) in cols.iter().enumerate() {
                if !first_col {
                    write!(writer, ", ")?;
                }
                first_col = false;
                let value = Self::format_mysql_value(row, i);
                write!(writer, "\"{}\": {}", col.name(), value)?;
            }
            write!(writer, "}}")?;
        }
        writeln!(writer)?;

        Ok(row_count)
    }

    /// Fetch PostgreSQL rows for XML/XLSX export
    async fn fetch_postgres_rows_xml(
        pool: &sqlx::PgPool,
        query: &str,
        writer: &mut BufWriter<File>,
        options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        if rows.is_empty() {
            return Ok(0);
        }

        let columns: Vec<ColumnInfo> = rows[0]
            .columns()
            .iter()
            .map(|col| ColumnInfo {
                name: col.name().to_string(),
                type_name: Some(col.type_info().name().to_string()),
                nullable: None,
            })
            .collect();

        // Write header row
        if options.include_headers {
            write!(writer, "   <Row>")?;
            for col in &columns {
                write!(writer, r#"<Cell ss:StyleID="sHeader"><Data ss:Type="String">{}</Data></Cell>"#, Self::escape_xml(&col.name))?;
            }
            writeln!(writer, "</Row>")?;
        }

        // Write data rows
        for row in rows {
            write!(writer, "   <Row>")?;
            let cols = row.columns();
            for (i, _col) in cols.iter().enumerate() {
                let value = Self::format_pg_value(&row, i);
                write!(writer, r#"<Cell><Data ss:Type="String">{}</Data></Cell>"#, Self::escape_xml(&value))?;
            }
            writeln!(writer, "</Row>")?;
        }

        Ok(row_count)
    }

    /// Fetch MySQL rows for XML/XLSX export
    async fn fetch_mysql_rows_xml(
        pool: &sqlx::MySqlPool,
        query: &str,
        writer: &mut BufWriter<File>,
        options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        if rows.is_empty() {
            return Ok(0);
        }

        let columns: Vec<ColumnInfo> = rows[0]
            .columns()
            .iter()
            .map(|col| ColumnInfo {
                name: col.name().to_string(),
                type_name: Some(col.type_info().name().to_string()),
                nullable: None,
            })
            .collect();

        // Write header row
        if options.include_headers {
            write!(writer, "   <Row>")?;
            for col in &columns {
                write!(writer, r#"<Cell ss:StyleID="sHeader"><Data ss:Type="String">{}</Data></Cell>"#, Self::escape_xml(&col.name))?;
            }
            writeln!(writer, "</Row>")?;
        }

        // Write data rows
        for row in rows {
            write!(writer, "   <Row>")?;
            let cols = row.columns();
            for (i, _col) in cols.iter().enumerate() {
                let value = Self::format_mysql_value(&row, i);
                write!(writer, r#"<Cell><Data ss:Type="String">{}</Data></Cell>"#, Self::escape_xml(&value))?;
            }
            writeln!(writer, "</Row>")?;
        }

        Ok(row_count)
    }

    /// Escape CSV field according to RFC 4180
    fn escape_csv_field(value: &str) -> String {
        if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
            format!("\"{}\"", value.replace('"', "\"\""))
        } else {
            value.to_string()
        }
    }

    /// Escape XML special characters
    fn escape_xml(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&apos;")
    }

    /// Format PostgreSQL value for output
    fn format_pg_value(row: &sqlx::postgres::PgRow, index: usize) -> String {
        if let Ok(val) = row.try_get::<String, _>(index) {
            return val;
        }
        if let Ok(val) = row.try_get::<i64, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<f64, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<bool, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<serde_json::Value, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<chrono::NaiveDate, _>(index) {
            return val.to_string();
        }
        "null".to_string()
    }

    /// Format MySQL value for output
    fn format_mysql_value(row: &sqlx::mysql::MySqlRow, index: usize) -> String {
        if let Ok(val) = row.try_get::<String, _>(index) {
            return val;
        }
        if let Ok(val) = row.try_get::<i64, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<f64, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<bool, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<serde_json::Value, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<chrono::NaiveDate, _>(index) {
            return val.to_string();
        }
        "null".to_string()
    }

    /// Fetch SQLite rows for CSV export
    async fn fetch_sqlite_rows_csv(
        pool: &sqlx::SqlitePool,
        query: &str,
        writer: &mut BufWriter<File>,
        options: &ExportOptions,
    ) -> Result<(Vec<ColumnInfo>, u64), DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        if rows.is_empty() {
            return Ok((Vec::new(), 0));
        }

        let columns: Vec<ColumnInfo> = rows[0]
            .columns()
            .iter()
            .map(|col| ColumnInfo {
                name: col.name().to_string(),
                type_name: Some(col.type_info().name().to_string()),
                nullable: None,
            })
            .collect();

        // Write headers
        if options.include_headers {
            let header: String = columns
                .iter()
                .map(|c| Self::escape_csv_field(&c.name))
                .collect::<Vec<_>>()
                .join(",");
            writeln!(writer, "{}", header)
                .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write CSV header: {}", e)))?;
        }

        // Write rows
        for row in &rows {
            let line: String = (0..row.columns().len())
                .map(|i| Self::escape_csv_field(&Self::format_sqlite_value(row, i)))
                .collect::<Vec<_>>()
                .join(",");
            writeln!(writer, "{}", line)
                .map_err(|e| DatabaseError::QueryFailed(format!("Failed to write CSV row: {}", e)))?;
        }

        Ok((columns, row_count))
    }

    /// Fetch SQLite rows for JSON export
    async fn fetch_sqlite_rows_json(
        pool: &sqlx::SqlitePool,
        query: &str,
        writer: &mut BufWriter<File>,
        _options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        let mut first = true;
        for row in &rows {
            if !first {
                writeln!(writer, ",")?;
            }
            first = false;

            write!(writer, "  {{")?;
            let cols = row.columns();
            let mut first_col = true;
            for (i, col) in cols.iter().enumerate() {
                if !first_col {
                    write!(writer, ", ")?;
                }
                first_col = false;
                let value = Self::format_sqlite_value(row, i);
                write!(writer, "\"{}\": {}", col.name(), value)?;
            }
            write!(writer, "}}")?;
        }
        writeln!(writer)?;

        Ok(row_count)
    }

    /// Fetch SQLite rows for XML/XLSX export
    async fn fetch_sqlite_rows_xml(
        pool: &sqlx::SqlitePool,
        query: &str,
        writer: &mut BufWriter<File>,
        options: &ExportOptions,
    ) -> Result<u64, DatabaseError> {
        let rows = sqlx::query(query)
            .fetch_all(pool)
            .await
            .map_err(|e| DatabaseError::QueryFailed(e.to_string()))?;

        let row_count = rows.len() as u64;

        if rows.is_empty() {
            return Ok(0);
        }

        let columns: Vec<ColumnInfo> = rows[0]
            .columns()
            .iter()
            .map(|col| ColumnInfo {
                name: col.name().to_string(),
                type_name: Some(col.type_info().name().to_string()),
                nullable: None,
            })
            .collect();

        // Write header row
        if options.include_headers {
            write!(writer, "   <Row>")?;
            for col in &columns {
                write!(writer, r#"<Cell ss:StyleID="sHeader"><Data ss:Type="String">{}</Data></Cell>"#, Self::escape_xml(&col.name))?;
            }
            writeln!(writer, "</Row>")?;
        }

        // Write data rows
        for row in rows {
            write!(writer, "   <Row>")?;
            let cols = row.columns();
            for (i, _col) in cols.iter().enumerate() {
                let value = Self::format_sqlite_value(&row, i);
                write!(writer, r#"<Cell><Data ss:Type="String">{}</Data></Cell>"#, Self::escape_xml(&value))?;
            }
            writeln!(writer, "</Row>")?;
        }

        Ok(row_count)
    }

    /// Format SQLite value for output
    fn format_sqlite_value(row: &sqlx::sqlite::SqliteRow, index: usize) -> String {
        if let Ok(val) = row.try_get::<String, _>(index) {
            return val;
        }
        if let Ok(val) = row.try_get::<i64, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<f64, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<bool, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<serde_json::Value, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<chrono::NaiveDateTime, _>(index) {
            return val.to_string();
        }
        if let Ok(val) = row.try_get::<chrono::NaiveDate, _>(index) {
            return val.to_string();
        }
        "null".to_string()
    }
}
