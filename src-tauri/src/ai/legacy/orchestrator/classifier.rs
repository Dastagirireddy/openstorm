use super::types::Strategy;

pub fn classify_task(msg: &str) -> Strategy {
    let msg_lower = msg.to_lowercase();

    let has_multi_file = msg_lower.contains("refactor")
        || msg_lower.contains("rename")
        || msg_lower.contains("move")
        || msg_lower.contains("across")
        || msg_lower.contains("multiple files");

    let has_exploration = msg_lower.contains("figure out")
        || msg_lower.contains("explore")
        || msg_lower.contains("understand")
        || msg_lower.contains("how does")
        || msg_lower.contains("what is")
        || msg_lower.contains("explain");

    let has_decomposition = msg_lower.contains("implement")
        || msg_lower.contains("build")
        || msg_lower.contains("create")
        || msg_lower.contains("add feature")
        || msg_lower.contains("full");

    if has_multi_file {
        Strategy::Refactor
    } else if has_exploration {
        Strategy::Explore
    } else if has_decomposition && msg.len() > 100 {
        Strategy::Decompose
    } else {
        Strategy::Simple
    }
}
