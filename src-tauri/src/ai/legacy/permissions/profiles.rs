use std::collections::HashMap;

use super::types::{PermissionProfile, ToolPermission, TrustTier, TrustTierConfig};

pub fn default_permissions_for_profile(profile: &PermissionProfile) -> HashMap<String, ToolPermission> {
    match profile {
        PermissionProfile::Full => HashMap::new(),
        PermissionProfile::ReadOnly => {
            let mut perms = HashMap::new();
            let denied = vec![".*".to_string()];
            perms.insert("write_file".to_string(), ToolPermission {
                requires_approval: false,
                allowed_patterns: vec![],
                denied_patterns: denied.clone(),
                rate_limit: None,
            });
            perms.insert("edit_file".to_string(), ToolPermission {
                requires_approval: false,
                allowed_patterns: vec![],
                denied_patterns: denied.clone(),
                rate_limit: None,
            });
            perms.insert("run_command".to_string(), ToolPermission {
                requires_approval: false,
                allowed_patterns: vec![],
                denied_patterns: denied.clone(),
                rate_limit: None,
            });
            perms.insert("git_commit".to_string(), ToolPermission {
                requires_approval: false,
                allowed_patterns: vec![],
                denied_patterns: denied,
                rate_limit: None,
            });
            perms
        }
        PermissionProfile::Guided => {
            let mut perms = HashMap::new();
            perms.insert("write_file".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![],
                rate_limit: Some(10),
            });
            perms.insert("edit_file".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![],
                rate_limit: Some(15),
            });
            perms.insert("run_command".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![],
                rate_limit: Some(5),
            });
            perms.insert("git_commit".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![],
                rate_limit: Some(3),
            });
            perms
        }
        PermissionProfile::Smart => {
            let mut perms = HashMap::new();
            perms.insert("write_file".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![
                    r"^\..*".to_string(),
                    r".*\.lock$".to_string(),
                    r".*\.env$".to_string(),
                ],
                rate_limit: Some(10),
            });
            perms.insert("edit_file".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![
                    r"^\..*".to_string(),
                    r".*\.lock$".to_string(),
                ],
                rate_limit: Some(15),
            });
            perms.insert("run_command".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![
                    r"rm\s+-rf\s+/".to_string(),
                    r"sudo\s+".to_string(),
                    r"curl.*\|\s*sh".to_string(),
                ],
                rate_limit: Some(5),
            });
            perms.insert("git_commit".to_string(), ToolPermission {
                requires_approval: true,
                allowed_patterns: vec![],
                denied_patterns: vec![],
                rate_limit: Some(3),
            });
            perms
        }
        PermissionProfile::Custom(perms) => perms.clone(),
    }
}

impl Default for TrustTierConfig {
    fn default() -> Self {
        let mut patterns = HashMap::new();
        let mut whitelists = HashMap::new();

        patterns.insert(TrustTier::Safe, vec![
            r"^ls(\s+.*)?$".to_string(),
            r"^cat(\s+.*)?$".to_string(),
            r"^grep(\s+.*)?$".to_string(),
            r"^find(\s+.*)?$".to_string(),
            r"^git\s+status$".to_string(),
            r"^git\s+log(\s+.*)?$".to_string(),
            r"^git\s+diff(\s+.*)?$".to_string(),
            r"^git\s+show(\s+.*)?$".to_string(),
            r"^head(\s+.*)?$".to_string(),
            r"^tail(\s+.*)?$".to_string(),
            r"^wc(\s+.*)?$".to_string(),
            r"^file(\s+.*)?$".to_string(),
        ]);
        whitelists.insert(TrustTier::Safe, vec![
            "read_file".to_string(),
            "list_directory".to_string(),
            "search_code".to_string(),
            "search_files".to_string(),
            "get_diagnostics".to_string(),
            "print_tree".to_string(),
        ]);

        patterns.insert(TrustTier::Standard, vec![
            r"^npm\s+install(\s+.*)?$".to_string(),
            r"^npm\s+run\s+\w+$".to_string(),
            r"^pnpm\s+install(\s+.*)?$".to_string(),
            r"^pnpm\s+run\s+\w+$".to_string(),
            r"^yarn\s+install(\s+.*)?$".to_string(),
            r"^cargo\s+build(\s+.*)?$".to_string(),
            r"^cargo\s+test(\s+.*)?$".to_string(),
            r"^cargo\s+check(\s+.*)?$".to_string(),
            r"^cargo\s+clippy(\s+.*)?$".to_string(),
            r"^cargo\s+fmt(\s+.*)?$".to_string(),
            r"^git\s+add(\s+.*)?$".to_string(),
            r"^git\s+commit(\s+.*)?$".to_string(),
            r"^git\s+checkout(\s+.*)?$".to_string(),
            r"^git\s+branch(\s+.*)?$".to_string(),
            r"^git\s+stash(\s+.*)?$".to_string(),
            r"^git\s+pull(\s+.*)?$".to_string(),
            r"^make(\s+.*)?$".to_string(),
            r"^python(\s+.*)?$".to_string(),
            r"^python3(\s+.*)?$".to_string(),
            r"^node(\s+.*)?$".to_string(),
        ]);
        whitelists.insert(TrustTier::Standard, vec![
            "write_file".to_string(),
            "edit_file".to_string(),
            "run_command".to_string(),
        ]);

        patterns.insert(TrustTier::Destructive, vec![
            r"^rm\s+-rf".to_string(),
            r"^rm\s+-r".to_string(),
            r"^sudo\s+".to_string(),
            r"^curl.*\|\s*sh".to_string(),
            r"^wget.*\|\s*sh".to_string(),
            r"^chmod\s+777".to_string(),
            r"^chown\s+".to_string(),
            r"^kill\s+-9".to_string(),
            r"^pkill\s+".to_string(),
            r"^git\s+push\s+--force".to_string(),
            r"^git\s+push\s+-f".to_string(),
            r"^git\s+reset\s+--hard".to_string(),
            r"^git\s+clean\s+-fd".to_string(),
            r"^git\s+checkout\s+--\s+\.".to_string(),
            r"^docker\s+rm\s+".to_string(),
            r"^docker\s+rmi\s+".to_string(),
            r"^dropdb\s+".to_string(),
            r"^drop\s+database".to_string(),
        ]);
        whitelists.insert(TrustTier::Destructive, vec![
            "git_push_force".to_string(),
            "delete_database".to_string(),
        ]);

        Self { patterns, whitelists }
    }
}
