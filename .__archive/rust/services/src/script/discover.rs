//! Discover scripts from `.workhorse/scripts` under cwd and home.
//!
//! Ported from `packages/core-v2/src/services/script/discover.ts` (the skill
//! prefix path is deferred until `SkillService` lands).

use std::path::{Path, PathBuf};

use crate::script::front_matter::{Script, parse_front_matter};

/// Relative scripts dir: `.workhorse/scripts`.
pub const SCRIPTS_SUBDIR: &str = ".workhorse/scripts";

/// Discover scripts from `<cwd>/.workhorse/scripts` then `<home>/.workhorse/scripts`.
/// Invalid files are skipped, never error. Names are de-duped first-wins, so a
/// project script (`cwd`) shadows a global one (`home`) of the same name.
#[must_use]
pub fn discover_scripts(cwd: &Path, home: &Path) -> Vec<Script> {
    let mut scripts = Vec::new();
    load_dir(&mut scripts, &cwd.join(SCRIPTS_SUBDIR));
    load_dir(&mut scripts, &home.join(SCRIPTS_SUBDIR));

    let mut seen = std::collections::HashSet::new();
    scripts.retain(|s| seen.insert(s.name.clone()));
    scripts
}

/// The write target: `<cwd>/.workhorse/scripts`.
#[must_use]
pub fn scripts_dir(cwd: &Path) -> PathBuf {
    cwd.join(SCRIPTS_SUBDIR)
}

fn load_dir(scripts: &mut Vec<Script>, dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "sh") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if let Ok(raw) = std::fs::read_to_string(&path) {
            scripts.push(parse_front_matter(&raw, name));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn discovers_sh_files_from_cwd() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join(SCRIPTS_SUBDIR);
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("hello.sh"),
            "# ---\n# description: hi\n# ---\necho hi",
        )
        .unwrap();
        fs::write(dir.join("ignore.txt"), "not a script").unwrap();

        let home = tempfile::tempdir().unwrap();
        let scripts = discover_scripts(tmp.path(), home.path());
        assert_eq!(scripts.len(), 1);
        assert_eq!(scripts[0].name, "hello");
        assert_eq!(scripts[0].description, "hi");
    }

    #[test]
    fn missing_dir_yields_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        assert!(discover_scripts(tmp.path(), home.path()).is_empty());
    }

    #[test]
    fn cwd_script_shadows_home_of_same_name() {
        let cwd = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        let cwd_dir = cwd.path().join(SCRIPTS_SUBDIR);
        let home_dir = home.path().join(SCRIPTS_SUBDIR);
        fs::create_dir_all(&cwd_dir).unwrap();
        fs::create_dir_all(&home_dir).unwrap();
        fs::write(
            cwd_dir.join("dup.sh"),
            "# ---\n# description: project\n# ---\necho project",
        )
        .unwrap();
        fs::write(
            home_dir.join("dup.sh"),
            "# ---\n# description: global\n# ---\necho global",
        )
        .unwrap();

        let scripts = discover_scripts(cwd.path(), home.path());
        assert_eq!(scripts.len(), 1, "duplicate name should appear once");
        assert_eq!(scripts[0].description, "project", "cwd wins over home");
    }
}
