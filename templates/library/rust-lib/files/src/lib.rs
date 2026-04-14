//! {{project-name}} - A Rust library
//!
//! This library provides useful functionality.

/// A example function
pub fn hello() -> &'static str {
    "Hello from {{project-name}}!"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hello() {
        assert_eq!(hello(), "Hello from {{project-name}}!");
    }
}
