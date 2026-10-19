//! Spike: can a process sandbox itself with `nono` so that it and its
//! children are confined to a policy's union of grants?
//!
//! Usage:
//!   sandbox-probe [--net deny|loopback] [--linux-apply auto|baseline] [--keep-dns]
//!   sandbox-probe child-read <path>      (internal: used by the inheritance probe)

use nono::{AccessMode, CapabilitySet, Sandbox, UnixSocketMode};
use std::io;
use std::net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs, UdpSocket};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Outcome {
    Allow,
    Deny,
}

impl Outcome {
    fn label(self) -> &'static str {
        match self {
            Outcome::Allow => "allow",
            Outcome::Deny => "deny",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum NetMode {
    Deny,
    Loopback,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LinuxApply {
    Auto,
    Baseline,
}

struct Opts {
    net: NetMode,
    linux_apply: LinuxApply,
    keep_dns: bool,
}

/// Paths and sockets prepared before the sandbox is applied.
struct Fixture {
    root: PathBuf,
    ro: PathBuf,
    rw: PathBuf,
    outside: PathBuf,
    cat: Option<PathBuf>,
    home: Option<PathBuf>,
    exe: PathBuf,
    loopback: SocketAddr,
    lan_same_port: Option<SocketAddr>,
    _tcp: TcpListener,
    _unix_in: UnixListener,
    _unix_out: UnixListener,
}

#[derive(Default)]
struct Report {
    failures: u32,
}

impl Report {
    fn record(&mut self, name: &str, expected: Outcome, (actual, detail): (Outcome, String)) {
        if expected != actual {
            self.failures += 1;
        }
        println!(
            "PROBE {name} expected={} actual={} detail={detail}",
            expected.label(),
            actual.label()
        );
    }
}

fn io_outcome<T>(result: io::Result<T>) -> (Outcome, String) {
    match result {
        Ok(_) => (Outcome::Allow, "ok".to_string()),
        Err(e) => (Outcome::Deny, format!("{:?}/os{:?}: {e}", e.kind(), e.raw_os_error())),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("child-read") {
        return child_read(args.get(1));
    }
    let opts = match parse_opts(&args) {
        Ok(opts) => opts,
        Err(msg) => {
            eprintln!("usage error: {msg}");
            return ExitCode::from(2);
        }
    };
    match run(&opts) {
        Ok(0) => ExitCode::SUCCESS,
        Ok(n) => {
            println!("RESULT failures={n}");
            ExitCode::from(1)
        }
        Err(msg) => {
            eprintln!("setup error: {msg}");
            ExitCode::from(2)
        }
    }
}

fn parse_opts(args: &[String]) -> Result<Opts, String> {
    let mut opts = Opts { net: NetMode::Deny, linux_apply: LinuxApply::Auto, keep_dns: false };
    let mut it = args.iter();
    while let Some(arg) = it.next() {
        match (arg.as_str(), it.as_slice().first().map(String::as_str)) {
            ("--net", Some("deny")) => opts.net = NetMode::Deny,
            ("--net", Some("loopback")) => opts.net = NetMode::Loopback,
            ("--linux-apply", Some("auto")) => opts.linux_apply = LinuxApply::Auto,
            ("--linux-apply", Some("baseline")) => opts.linux_apply = LinuxApply::Baseline,
            ("--keep-dns", _) => {
                opts.keep_dns = true;
                continue;
            }
            _ => return Err(format!("unrecognised argument {arg:?}")),
        }
        it.next();
    }
    Ok(opts)
}

/// Child mode: exit 0 if the file is readable, 3 if not.
fn child_read(path: Option<&String>) -> ExitCode {
    let Some(path) = path else { return ExitCode::from(2) };
    let (outcome, detail) = io_outcome(std::fs::read(path));
    println!("CHILD read={} detail={detail}", outcome.label());
    match outcome {
        Outcome::Allow => ExitCode::SUCCESS,
        Outcome::Deny => ExitCode::from(3),
    }
}

fn run(opts: &Opts) -> Result<u32, String> {
    let fx = prepare().map_err(|e| format!("prepare: {e}"))?;
    println!("INFO support={:?}", Sandbox::support_info());
    print_abi();
    precheck(&fx);

    let caps = policy(&fx, opts).map_err(|e| format!("policy: {e}"))?;
    let started = Instant::now();
    let applied = apply(&caps, opts.linux_apply).map_err(|e| format!("apply: {e}"))?;
    println!("INFO applied={applied} apply_us={}", started.elapsed().as_micros());

    let mut report = Report::default();
    filesystem_probes(&mut report, &fx);
    network_probes(&mut report, &fx, opts);
    child_probes(&mut report, &fx);
    reapply_probe(&mut report, &fx);
    let _ = std::fs::remove_dir_all(&fx.root);
    Ok(report.failures)
}

fn prepare() -> io::Result<Fixture> {
    let root = PathBuf::from(format!("/tmp/sbp-{}", std::process::id()));
    let (ro, rw, outside) = (root.join("granted-ro"), root.join("granted-rw"), root.join("outside"));
    for dir in [&ro, &rw, &outside] {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(ro.join("file.txt"), "ro")?;
    std::fs::write(outside.join("secret.txt"), "secret")?;
    let tcp = TcpListener::bind("0.0.0.0:0")?;
    let port = tcp.local_addr()?.port();
    Ok(Fixture {
        _unix_in: UnixListener::bind(rw.join("bridge.sock"))?,
        _unix_out: UnixListener::bind(outside.join("other.sock"))?,
        loopback: SocketAddr::from(([127, 0, 0, 1], port)),
        lan_same_port: lan_ip().map(|ip| SocketAddr::new(ip, port)),
        _tcp: tcp,
        cat: find_cat(),
        home: home_file(),
        exe: std::env::current_exe()?.canonicalize()?,
        root,
        ro,
        rw,
        outside,
    })
}

/// Local non-loopback address; UDP connect sends no packets.
fn lan_ip() -> Option<std::net::IpAddr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("1.1.1.1:80").ok()?;
    sock.local_addr().ok().map(|a| a.ip())
}

fn find_cat() -> Option<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    std::iter::once(PathBuf::from("/bin"))
        .chain(std::env::split_paths(&path))
        .map(|dir| dir.join("cat"))
        .find(|p| p.is_file())
}

fn home_file() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME")?);
    [".ssh/known_hosts", ".ssh/authorized_keys", ".bashrc", ".zshrc", ".profile"]
        .iter()
        .map(|f| home.join(f))
        .find(|p| p.is_file())
}

#[cfg(target_os = "linux")]
fn print_abi() {
    match nono::detect_abi() {
        Ok(abi) => println!("INFO landlock_abi={abi} features={:?}", abi.feature_names()),
        Err(e) => println!("INFO landlock_abi=none error={e}"),
    }
}

#[cfg(not(target_os = "linux"))]
fn print_abi() {}

/// Shows the denials below come from the sandbox, not from missing fixtures.
fn precheck(fx: &Fixture) {
    let outside = io_outcome(std::fs::read(fx.outside.join("secret.txt")));
    println!("PRECHECK read-outside actual={} detail={}", outside.0.label(), outside.1);
    if let Some(home) = &fx.home {
        let res = io_outcome(std::fs::read(home));
        println!("PRECHECK read-home({}) actual={} detail={}", home.display(), res.0.label(), res.1);
    }
    let tcp = tcp_connect("1.1.1.1:443".parse().ok());
    println!("PRECHECK tcp-1.1.1.1:443 actual={} detail={}", tcp.0.label(), tcp.1);
    let udp = udp_dns();
    println!("PRECHECK udp-dns-1.1.1.1:53 actual={} detail={}", udp.0.label(), udp.1);
}

/// Host paths a child needs to exec `cat` or this binary; never the home dir or /tmp.
fn system_read_paths() -> Vec<&'static str> {
    ["/bin", "/usr", "/lib", "/lib64", "/System", "/nix/store", "/private/var/db/dyld"]
        .into_iter()
        .filter(|p| Path::new(p).is_dir())
        .collect()
}

fn policy(fx: &Fixture, opts: &Opts) -> nono::Result<CapabilitySet> {
    let mut caps = CapabilitySet::new()
        .allow_path(&fx.ro, AccessMode::Read)?
        .allow_path(&fx.rw, AccessMode::ReadWrite)?
        .allow_unix_socket_dir(&fx.rw, UnixSocketMode::ConnectBind)?
        .allow_file(&fx.exe, AccessMode::Read)?
        .allow_file("/dev/null", AccessMode::ReadWrite)?
        .block_network();
    for path in system_read_paths() {
        caps = caps.allow_path(path, AccessMode::Read)?;
    }
    if !opts.keep_dns {
        caps = caps.block_dns();
    }
    if opts.net == NetMode::Loopback {
        caps = caps.allow_localhost_port(fx.loopback.port());
    }
    Ok(caps)
}

#[cfg(target_os = "macos")]
fn apply(caps: &CapabilitySet, _linux_apply: LinuxApply) -> nono::Result<String> {
    Sandbox::apply_auto(caps).map(|()| "seatbelt".to_string())
}

#[cfg(target_os = "linux")]
fn apply(caps: &CapabilitySet, linux_apply: LinuxApply) -> nono::Result<String> {
    match linux_apply {
        LinuxApply::Auto => Sandbox::apply_auto(caps)
            .map(|f| format!("landlock(apply_auto) seccomp_fallback={f:?}")),
        LinuxApply::Baseline => Sandbox::apply_seccomp(caps, nono::SeccompOpts::network_baseline())
            .map(|f| format!("landlock+seccomp(network_baseline) seccomp_fallback={f:?}")),
    }
}

fn filesystem_probes(report: &mut Report, fx: &Fixture) {
    report.record("read-granted-ro", Outcome::Allow, io_outcome(std::fs::read(fx.ro.join("file.txt"))));
    report.record("write-granted-ro", Outcome::Deny, io_outcome(std::fs::write(fx.ro.join("new.txt"), "x")));
    report.record("write-granted-rw", Outcome::Allow, io_outcome(std::fs::write(fx.rw.join("new.txt"), "x")));
    report.record(
        "read-outside",
        Outcome::Deny,
        io_outcome(std::fs::read(fx.outside.join("secret.txt"))),
    );
    match &fx.home {
        Some(home) => report.record("read-home", Outcome::Deny, io_outcome(std::fs::read(home))),
        None => println!("SKIP read-home (no candidate file)"),
    }
}

fn network_probes(report: &mut Report, fx: &Fixture, opts: &Opts) {
    report.record("tcp-1.1.1.1:443", Outcome::Deny, tcp_connect("1.1.1.1:443".parse().ok()));
    report.record("udp-dns-1.1.1.1:53", Outcome::Deny, udp_dns());
    report.record("dns-resolve-example.com", Outcome::Deny, resolve());
    let loopback_expected = match opts.net {
        NetMode::Deny => Outcome::Deny,
        NetMode::Loopback => Outcome::Allow,
    };
    report.record("tcp-loopback-listener", loopback_expected, tcp_connect(Some(fx.loopback)));
    match fx.lan_same_port {
        Some(addr) => report.record("tcp-lan-ip-same-port", Outcome::Deny, tcp_connect(Some(addr))),
        None => println!("SKIP tcp-lan-ip-same-port (no LAN address)"),
    }
    let remote_same_port = SocketAddr::from(([1, 1, 1, 1], fx.loopback.port()));
    report.record("tcp-remote-same-port", Outcome::Deny, tcp_connect(Some(remote_same_port)));
    report.record("tcp-bind-loopback", Outcome::Deny, io_outcome(TcpListener::bind("127.0.0.1:0")));
    report.record(
        "unix-connect-granted-rw",
        Outcome::Allow,
        io_outcome(UnixStream::connect(fx.rw.join("bridge.sock"))),
    );
    report.record(
        "unix-bind-granted-rw",
        Outcome::Allow,
        io_outcome(UnixListener::bind(fx.rw.join("new.sock"))),
    );
    report.record(
        "unix-connect-outside",
        Outcome::Deny,
        io_outcome(UnixStream::connect(fx.outside.join("other.sock"))),
    );
}

/// Only a permission error is a sandbox deny; a timeout or refusal means the
/// connection attempt left the process.
fn tcp_connect(addr: Option<SocketAddr>) -> (Outcome, String) {
    let Some(addr) = addr else { return (Outcome::Deny, "bad address".to_string()) };
    match TcpStream::connect_timeout(&addr, Duration::from_secs(3)) {
        Err(e) if e.kind() != io::ErrorKind::PermissionDenied => {
            (Outcome::Allow, format!("not blocked by sandbox, network said {:?}: {e}", e.kind()))
        }
        result => io_outcome(result),
    }
}

/// Allow only if a DNS reply actually comes back.
fn udp_dns() -> (Outcome, String) {
    const QUERY: &[u8] = b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\x07example\x03com\x00\x00\x01\x00\x01";
    let send = || -> io::Result<UdpSocket> {
        let sock = UdpSocket::bind("0.0.0.0:0")?;
        sock.set_read_timeout(Some(Duration::from_secs(3)))?;
        sock.send_to(QUERY, "1.1.1.1:53")?;
        Ok(sock)
    };
    let sock = match send() {
        Ok(sock) => sock,
        Err(e) => return io_outcome::<()>(Err(e)),
    };
    match sock.recv(&mut [0u8; 512]) {
        Ok(n) => (Outcome::Allow, format!("reply {n} bytes")),
        Err(e) => (Outcome::Allow, format!("sent, no reply ({:?}: {e})", e.kind())),
    }
}

fn resolve() -> (Outcome, String) {
    match ("example.com", 443).to_socket_addrs() {
        Ok(mut addrs) => (Outcome::Allow, format!("resolved {:?}", addrs.next())),
        Err(e) => io_outcome::<()>(Err(e)),
    }
}

fn child_probes(report: &mut Report, fx: &Fixture) {
    match &fx.cat {
        Some(cat) => {
            report.record("child-cat-granted-ro(control)", Outcome::Allow, spawn(cat, &[&fx.ro.join("file.txt")]));
            report.record("child-cat-outside", Outcome::Deny, spawn(cat, &[&fx.outside.join("secret.txt")]));
        }
        None => println!("SKIP child-cat (cat not found)"),
    }
    let mode = Path::new("child-read");
    report.record(
        "child-self-read-granted-ro(control)",
        Outcome::Allow,
        spawn(&fx.exe, &[mode, &fx.ro.join("file.txt")]),
    );
    report.record(
        "child-self-read-outside",
        Outcome::Deny,
        spawn(&fx.exe, &[mode, &fx.outside.join("secret.txt")]),
    );
}

fn spawn(program: &Path, args: &[&Path]) -> (Outcome, String) {
    match Command::new(program).args(args).output() {
        Ok(out) => {
            let text = format!(
                "status={} stdout={:?} stderr={:?}",
                out.status,
                String::from_utf8_lossy(&out.stdout).trim(),
                String::from_utf8_lossy(&out.stderr).trim()
            );
            let outcome = if out.status.success() { Outcome::Allow } else { Outcome::Deny };
            (outcome, text)
        }
        Err(e) => (Outcome::Deny, format!("spawn failed {:?}: {e}", e.kind())),
    }
}

/// A second, wider policy must not widen the first.
fn reapply_probe(report: &mut Report, fx: &Fixture) {
    let wider = CapabilitySet::new()
        .allow_path("/", AccessMode::ReadWrite)
        .and_then(|caps| caps.allow_path(&fx.root, AccessMode::ReadWrite));
    let applied = match wider {
        Ok(caps) => match apply(&caps, LinuxApply::Auto) {
            Ok(how) => format!("Ok({how})"),
            Err(e) => format!("Err({e})"),
        },
        Err(e) => format!("policy-error({e})"),
    };
    println!("INFO reapply_wider(allow / rw, network allowed)={applied}");
    let (outcome, detail) = io_outcome(std::fs::read(fx.outside.join("secret.txt")));
    report.record("reapply-wider-read-outside", Outcome::Deny, (outcome, detail));
    let (outcome, detail) = tcp_connect("1.1.1.1:443".parse().ok());
    report.record("reapply-wider-tcp-1.1.1.1:443", Outcome::Deny, (outcome, detail));
}
