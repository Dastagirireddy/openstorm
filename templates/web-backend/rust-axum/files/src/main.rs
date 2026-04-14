use axum::{
    extract::Json,
    http::StatusCode,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Serialize, Deserialize)]
struct Item {
    name: String,
    description: Option<String>,
    price: f64,
}

#[derive(Serialize)]
struct Message {
    message: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::FmtSubscriber::new())
        .init();

    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health))
        .route("/items", post(create_item));

    let port = {{port}};
    let addr = format!("0.0.0.0:{}", port);
    println!("Server running on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root() -> Json<Message> {
    Json(Message {
        message: format!("Hello from {{project-name}}!"),
    })
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({"status": "ok"}))
}

async fn create_item(Json(item): Json<Item>) -> Json<serde_json::Value> {
    Json(serde_json::json!({"item": item, "action": "created"}))
}
