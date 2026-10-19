//! Deny-by-default capability broker.
//!
//! A [`Broker`] holds the capabilities a client has been granted and nothing
//! else. Invoking a capability that was never granted is refused, and a granted
//! capability enforces its own scope — a filesystem read grant can only read
//! inside the root it was given. This crate proves that model in-process; the
//! wire protocol and daemon that carry it across a socket come later.

use std::path::{Path, PathBuf};

/// Name of the one capability this slice implements.
pub const FS_READ: &str = "fs.read";

/// A refusal by policy, as opposed to an operation that ran and failed.
#[derive(Debug, thiserror::Error)]
pub enum Denied {
    /// The broker holds no grant for this capability.
    #[error("capability `{capability}` was not granted")]
    Ungranted {
        /// The capability that was asked for.
        capability: &'static str,
    },
    /// The path resolved outside the granted root.
    #[error("path is outside the `{capability}` root")]
    OutsideRoot {
        /// The capability whose scope was violated.
        capability: &'static str,
    },
}

/// Why a read did not return bytes.
#[derive(Debug, thiserror::Error)]
pub enum ReadError {
    /// Refused before any file was touched.
    #[error(transparent)]
    Denied(#[from] Denied),
    /// Granted and in scope, but the read itself failed.
    #[error("read failed")]
    Io(#[from] std::io::Error),
}

/// A grant to read files, valid only inside `root`.
#[derive(Debug)]
pub struct FilesystemRead {
    root: PathBuf,
}

impl FilesystemRead {
    /// Grant reads inside `root`.
    ///
    /// # Errors
    /// Fails if `root` cannot be canonicalized (for example, it does not exist).
    pub fn new(root: &Path) -> std::io::Result<Self> {
        Ok(Self {
            root: root.canonicalize()?,
        })
    }

    /// Resolve `requested` against the root and confirm it stays inside it.
    ///
    /// A path that cannot be resolved is refused rather than reported as
    /// missing, so the grant never reveals whether an out-of-root file exists.
    //
    // ponytail: canonicalize-then-check is TOCTOU-racy (a symlink swapped
    // between this check and the open would escape) and folds "not found" into
    // OutsideRoot. Fine for an in-process slice; the daemon slice tightens it.
    fn resolve(&self, requested: &Path) -> Result<PathBuf, Denied> {
        let full = self.root.join(requested);
        match full.canonicalize() {
            Ok(resolved) if resolved.starts_with(&self.root) => Ok(resolved),
            _ => Err(Denied::OutsideRoot {
                capability: FS_READ,
            }),
        }
    }
}

/// Holds a client's grants. Constructed empty: everything is denied until a
/// grant is placed on it.
#[derive(Debug, Default)]
pub struct Broker {
    fs_read: Option<FilesystemRead>,
}

impl Broker {
    /// Place a filesystem-read grant on the broker.
    #[must_use]
    pub fn grant_fs_read(self, grant: FilesystemRead) -> Self {
        Self {
            fs_read: Some(grant),
        }
    }

    /// Read a file through the `fs.read` capability.
    ///
    /// # Errors
    /// Returns [`ReadError::Denied`] if `fs.read` was never granted or `path`
    /// resolves outside the granted root, and [`ReadError::Io`] if the file is
    /// in scope but cannot be read.
    pub fn read(&self, path: &Path) -> Result<Vec<u8>, ReadError> {
        let grant = self.fs_read.as_ref().ok_or(Denied::Ungranted {
            capability: FS_READ,
        })?;
        let resolved = grant.resolve(path)?;
        Ok(std::fs::read(resolved)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn scratch() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("wh-broker-{}-{unique}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn granted_read_returns_file_contents() {
        let root = scratch();
        fs::write(root.join("hello.txt"), b"hi").unwrap();
        let broker = Broker::default().grant_fs_read(FilesystemRead::new(&root).unwrap());

        assert_eq!(broker.read(Path::new("hello.txt")).unwrap(), b"hi");
    }

    #[test]
    fn ungranted_capability_is_refused() {
        let broker = Broker::default();

        let err = broker.read(Path::new("hello.txt")).unwrap_err();
        assert!(matches!(err, ReadError::Denied(Denied::Ungranted { .. })));
    }

    #[test]
    fn path_outside_root_is_refused() {
        let root = scratch();
        let secret = root.join("..").join("wh-secret.txt");
        fs::write(&secret, b"top").unwrap();
        let broker = Broker::default().grant_fs_read(FilesystemRead::new(&root).unwrap());

        let err = broker.read(Path::new("../wh-secret.txt")).unwrap_err();
        assert!(matches!(err, ReadError::Denied(Denied::OutsideRoot { .. })));
    }
}
